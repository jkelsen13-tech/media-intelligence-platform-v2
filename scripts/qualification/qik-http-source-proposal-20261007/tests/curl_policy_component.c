/* Offline adapters for exact repaired C functions. No libcurl/PG library links,
 * network, database, trust-file reads, extension loading, or old-code execution. */
#define _POSIX_C_SOURCE 200809L
#define CURL_DISABLE_TYPECHECK
#include <curl/curl.h>
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <setjmp.h>

#ifdef COMPONENT_OLD_PROTOCOL_API
#undef LIBCURL_VERSION_NUM
#define LIBCURL_VERSION_NUM 0x073400
#endif
#define PG_VERSION_STR "component-only"
#define ERROR 1
#define DEBUG2 2
#define ERRCODE_FEATURE_NOT_SUPPORTED 1
#define TYPEFUNC_COMPOSITE 1
#define PG_FUNCTION_ARGS void
#define fcinfo NULL

static void *allocations[10000];
static size_t allocation_count;
static void *palloc(size_t n) {
    void *p = malloc(n ? n : 1);
    assert(p && allocation_count < 10000);
    allocations[allocation_count++] = p;
    return p;
}
static void *palloc0(size_t n) { void *p = palloc(n); memset(p, 0, n); return p; }
static void pfree(void *p) {
    size_t i;
    for (i = 0; i < allocation_count; i++) {
        if (allocations[i] == p) {
            allocations[i] = allocations[--allocation_count]; free(p); return;
        }
    }
    assert(false);
}
static void release_allocations(void) {
    while (allocation_count) free(allocations[--allocation_count]);
}
typedef struct { size_t len; const char *data; } text;
#define VARSIZE_ANY_EXHDR(t) ((t)->len)
#define VARDATA_ANY(t) ((t)->data)
static char *text_to_cstring(text *t) {
    char *p = palloc(t->len + 1); memcpy(p, t->data, t->len); p[t->len] = 0; return p;
}
static text *cstring_to_text(const char *s) {
    text *t = palloc(sizeof(*t)); t->len = strlen(s); t->data = s; return t;
}
typedef void *MemoryContext;
#define CacheMemoryContext NULL
static char *MemoryContextStrdup(MemoryContext c, const char *s) {
    text t = {strlen(s), s}; (void)c; return text_to_cstring(&t);
}
static MemoryContext MemoryContextSwitchTo(MemoryContext c) { return c; }

static jmp_buf error_jump;
static const char *last_error;
static _Noreturn void component_error(const char *message) {
    last_error = message; longjmp(error_jump, 1);
}
#define elog(level, message, ...) do { if ((level) == ERROR) component_error(message); } while (0)
#define errmsg(message, ...) (message)
static const char *errcode(int code) { (void)code; return ""; }
#define ereport(level, args) do { (void)(level); component_error((args)); } while (0)

typedef uintptr_t Datum;
typedef void *TupleDesc;
typedef struct { Datum values[2]; bool nulls[2]; } *HeapTuple;
static HeapTuple heap_form_tuple(TupleDesc desc, Datum *values, bool *nulls) {
    HeapTuple t = palloc(sizeof(*t)); (void)desc;
    memcpy(t->values, values, sizeof(t->values)); memcpy(t->nulls, nulls, sizeof(t->nulls)); return t;
}
#define PointerGetDatum(p) ((Datum)(uintptr_t)(p))
#define HeapTupleGetDatum(t) PointerGetDatum(t)
typedef struct { MemoryContext multi_call_memory_ctx; void *user_fctx; TupleDesc tuple_desc; } FuncCallContext;
static FuncCallContext list_context;
static bool list_started;
static FuncCallContext *first_call(void) { list_started = true; return &list_context; }
#define SRF_IS_FIRSTCALL() (!list_started)
#define SRF_FIRSTCALL_INIT() first_call()
#define SRF_PERCALL_SETUP() (&list_context)
#define SRF_RETURN_NEXT(ctx, result) do { (void)(ctx); return (result); } while (0)
#define SRF_RETURN_DONE(ctx) do { (void)(ctx); return 0; } while (0)
static int get_call_result_type(void *info, int arg, TupleDesc *desc) {
    (void)info; (void)arg; *desc = (void *)1; return TYPEFUNC_COMPOSITE;
}
static void BlessTupleDesc(TupleDesc desc) { (void)desc; }
static text argument_text[2];
static bool argument_null[2];
#define PG_GETARG_TEXT_P(i) (&argument_text[i])
#define PG_ARGISNULL(i) argument_null[i]
#define PG_RETURN_BOOL(value) return (Datum)(value)

typedef struct { CURLoption option; long number; char string[160]; } CurlRecord;
static CurlRecord records[32];
static size_t record_count;
static CURLoption fail_option;
static int init_calls, reset_calls, append_calls;
static bool fail_init, fail_append;
static CURL *mock_init(void) { init_calls++; return fail_init ? NULL : (CURL *)(uintptr_t)1; }
static void mock_reset(CURL *handle) { assert(handle); reset_calls++; record_count = 0; }
static CURLcode mock_setopt(CURL *handle, CURLoption option, ...) {
    va_list args; size_t i; assert(handle);
    if (option == fail_option) return CURLE_UNKNOWN_OPTION;
    for (i = 0; i < record_count && records[i].option != option; i++) {}
    if (i == record_count) { assert(record_count < 32); record_count++; }
    memset(&records[i], 0, sizeof(records[i])); records[i].option = option;
    va_start(args, option);
    if (option >= CURLOPTTYPE_OBJECTPOINT && option < CURLOPTTYPE_FUNCTIONPOINT) {
        const char *value = va_arg(args, const char *);
        assert(value && strlen(value) < sizeof(records[i].string));
        strcpy(records[i].string, value);
    } else records[i].number = va_arg(args, long);
    va_end(args); return CURLE_OK;
}
static curl_version_info_data *mock_version(CURLversion version) {
    static curl_version_info_data info;
    (void)version; info.version_num = LIBCURL_VERSION_NUM; return &info;
}
static struct curl_slist *mock_append(struct curl_slist *head, const char *value) {
    struct curl_slist *item, *tail;
    if (fail_append) return NULL;
    item = palloc(sizeof(*item)); item->data = MemoryContextStrdup(NULL, value); item->next = NULL;
    if (!head) head = item;
    else { for (tail = head; tail->next; tail = tail->next) {} tail->next = item; }
    append_calls++; return head;
}
#define curl_easy_init mock_init
#define curl_easy_reset mock_reset
#undef curl_easy_setopt
#define curl_easy_setopt mock_setopt
#define curl_version_info mock_version
#define curl_slist_append mock_append
#include "curl_policy_extracted.h"

static CurlRecord *record(CURLoption option) {
    size_t i; for (i = 0; i < record_count; i++) if (records[i].option == option) return &records[i];
    return NULL;
}
static bool policy_applied(void) {
    return record(CURLOPT_PROXY) && !record(CURLOPT_PROXY)->string[0] &&
           record(CURLOPT_PRE_PROXY) && !record(CURLOPT_PRE_PROXY)->string[0] &&
           record(CURLOPT_SSL_VERIFYPEER) && record(CURLOPT_SSL_VERIFYPEER)->number == 1 &&
           record(CURLOPT_SSL_VERIFYHOST) && record(CURLOPT_SSL_VERIFYHOST)->number == 2 &&
           record(CURLOPT_FOLLOWLOCATION) && record(CURLOPT_FOLLOWLOCATION)->number == 0 &&
           record(CURLOPT_MAXREDIRS) && record(CURLOPT_MAXREDIRS)->number == 0;
}
static Datum set_option(const char *name, const char *value) {
    argument_text[0] = (text){strlen(name), name}; argument_text[1] = (text){strlen(value), value};
    argument_null[0] = argument_null[1] = false; return http_set_curlopt();
}
#define CHECK(expression) do { if (!(expression)) { fprintf(stderr, "check line %d failed\n", __LINE__); return 2; } checks++; } while (0)
#define REFUSED(expression, code) do { \
    last_error = NULL; \
    if (!setjmp(error_jump)) { (void)(expression); CHECK(false); } \
    else CHECK(last_error && strcmp(last_error, code) == 0); \
} while (0)
int main(void) {
    volatile int checks = 0;
    size_t i; long n = 0;
    char ca[80] = "/mip/trust/", oversized[8193], field[130], control_value[3] = "x ";
    const char *bad_uris[] = {
        "http://audit.example/rest/v1/events", "HTTPS://audit.example/rest/v1/events",
        "https://localhost/", "https://127.0.0.1/", "https://[::1]/", "https://audit.example:443/",
        "https://a@audit.example/", "https://audit.example", "https:///events",
        "https://audit.example/events?x=1", "https://audit.example/events#x",
        "https://audit.example/%0d%0a", "https://audit.example/a\\b", "https://audit.example/../events",
        "https://audit.example/a/./events", "https://audit.example/a//events", "https://audit.example/a..b",
        "https://audit.example\r\n/x", "https://audit.example./x", "https://.audit.example/x",
        "https://audit..example/x", "https://-audit.example/x", "https://audit-.example/x",
        "https://Audit.example/x", "https://audit_example/x", "https://audit.example/a b",
        "https://0x7f.1/", "https://audit.localhost/", "https://audit.local/",
        "https://audit.1a/", "https://audit.a/"
    };
    const char *unsafe_options[] = {
        "CURLOPT_PROXY_CAINFO", "CURLOPT_PROXY_TLSAUTH_USERNAME", "CURLOPT_PROXY_TLSAUTH_PASSWORD",
        "CURLOPT_PROXY_TLSAUTH_TYPE", "CURLOPT_PROXY", "CURLOPT_PRE_PROXY", "CURLOPT_PROXYPORT",
        "CURLOPT_PROXYUSERNAME", "CURLOPT_PROXYPASSWORD", "CURLOPT_USERPWD", "CURLOPT_USERAGENT",
        "CURLOPT_IPRESOLVE", "CURLOPT_SSLCERTTYPE", "CURLOPT_TLSAUTH_USERNAME", "CURLOPT_TLSAUTH_PASSWORD",
        "CURLOPT_TLSAUTH_TYPE", "CURLOPT_DNS_SERVERS", "CURLOPT_TCP_KEEPALIVE", "CURLOPT_TCP_KEEPIDLE",
        "CURLOPT_SSL_VERIFYHOST", "CURLOPT_SSL_VERIFYPEER", "CURLOPT_SSLCERT", "CURLOPT_SSLKEY",
        "CURLOPT_SSLKEY_BLOB", "CURLOPT_SSLCERT_BLOB", "CURLOPT_FOLLOWLOCATION", "CURLOPT_MAXREDIRS",
        "CURLOPT_URL", "CURLOPT_PROTOCOLS_STR", "CURLOPT_REDIR_PROTOCOLS_STR", "PUBLIC_COMPONENT_SENTINEL"
    };
    const char *bad_numbers[] = {"", "0", "-1", "+1", " 1", "1 ", "1x", "01", "1.5", "999999999999999999999999", "1\n"};
    const char *owned_headers[] = {"Host", "Connection", "Content-Length", "Transfer-Encoding",
                                  "Content-Type", "Proxy-Authorization", "Expect"};
    const char *bad_fields[] = {"", "A B", "A:B", "A\tB", "A\rB", "A\nB", "A(B", "A/B", "A=B", "A\177B"};
    struct curl_slist *headers = NULL;
    text embedded = {3, "a\0b"}; text public_text = {6, "public"};
    curl_version_info_data obsolete_version = {0};
    CHECK(request_type("POST") == HTTP_POST);
    CHECK(request_type("GET") == HTTP_UNKNOWN && request_type("PUT") == HTTP_UNKNOWN &&
          request_type("PATCH") == HTTP_UNKNOWN && request_type("DELETE") == HTTP_UNKNOWN &&
          request_type("HEAD") == HTTP_UNKNOWN && request_type("post") == HTTP_UNKNOWN);
    CHECK(http_uri_allowed("https://audit.example/rest/v1/events"));
    CHECK(http_uri_allowed("https://audit.example/"));
    CHECK(http_uri_allowed("https://audit.example/event-id_1.~"));
    for (i = 0; i < sizeof(bad_uris)/sizeof(*bad_uris); i++) CHECK(!http_uri_allowed(bad_uris[i]));
    memset(oversized, 'x', sizeof(oversized)); oversized[sizeof(oversized)-1] = 0;
    CHECK(!http_uri_allowed(oversized));
    memset(ca+11, 'a', 64); memcpy(ca+75, ".pem", 5);
    CHECK(http_cainfo_allowed(ca));
    CHECK(!http_cainfo_allowed("/mip/trust/public.pem"));
    CHECK(!http_cainfo_allowed("/tmp/public.pem"));
    CHECK(!http_cainfo_allowed("/mip/trust/../public.pem"));
    ca[11] = 'A'; CHECK(!http_cainfo_allowed(ca)); ca[11] = 'a';
    ca[74] = 'g'; CHECK(!http_cainfo_allowed(ca)); ca[74] = 'a';
    ca[78] = 'M'; CHECK(!http_cainfo_allowed(ca)); ca[78] = 'm';
    CHECK(sizeof(settable_curlopts)/sizeof(*settable_curlopts) == 6);
    CHECK(http_curlopt_value_valid(&settable_curlopts[0], ca, &n));
    CHECK(http_curlopt_value_valid(&settable_curlopts[1], "5", &n) && n == 5);
    CHECK(!http_curlopt_value_valid(&settable_curlopts[1], "6", &n));
    CHECK(http_curlopt_value_valid(&settable_curlopts[2], "5000", &n) && n == 5000);
    CHECK(!http_curlopt_value_valid(&settable_curlopts[2], "5001", &n));
    CHECK(http_curlopt_value_valid(&settable_curlopts[3], "1", &n) && n == 1);
    CHECK(!http_curlopt_value_valid(&settable_curlopts[3], "2", &n));
    CHECK(http_curlopt_value_valid(&settable_curlopts[4], "1000", &n) && n == 1000);
    CHECK(!http_curlopt_value_valid(&settable_curlopts[4], "1001", &n));
    for (i = 0; i < sizeof(bad_numbers)/sizeof(*bad_numbers); i++)
        CHECK(!http_curlopt_value_valid(&settable_curlopts[2], bad_numbers[i], &n));
    CHECK(http_request_header_valid("Authorization", "Bearer PUBLIC_COMPONENT_SENTINEL"));
    CHECK(http_request_header_valid("Prefer", "return=minimal, tx=commit"));
    CHECK(http_request_header_valid("X!#$%&'*+-.^_`|~", ""));
    for (i = 0; i < sizeof(bad_fields)/sizeof(*bad_fields); i++) CHECK(!http_request_header_valid(bad_fields[i], "public"));
    memset(field, 'x', sizeof(field)); field[128] = 0;
    CHECK(http_request_header_valid(field, "public")); field[128] = 'x'; field[129] = 0;
    CHECK(!http_request_header_valid(field, "public"));
    oversized[8191] = 0; CHECK(http_request_header_valid("X", oversized));
    oversized[8191] = 'x'; CHECK(!http_request_header_valid("X", oversized));
    for (i = 1; i < 32; i++) { control_value[1] = (char)i; CHECK(!http_request_header_valid("X", control_value)); }
    control_value[1] = 127; CHECK(!http_request_header_valid("X", control_value));
    control_value[1] = (char)128; CHECK(!http_request_header_valid("X", control_value));
    for (i = 0; i < sizeof(owned_headers)/sizeof(*owned_headers); i++) CHECK(!http_optional_header_allowed(owned_headers[i]));
    CHECK(!http_optional_header_allowed("hOsT") && http_optional_header_allowed("Content-Type-Extra"));
    CHECK(strcmp(http_text_to_cstring(&public_text), "public") == 0);
    obsolete_version.version_num = 0x073300;
    REFUSED(http_check_curl_version(&obsolete_version), "mip_http_curl_version_refused");
    REFUSED(http_text_to_cstring(&embedded), "mip_http_request_text_refused");
    embedded.len = 65537; REFUSED(http_text_to_cstring(&embedded), "mip_http_request_text_refused");
    CHECK(http_apply_transport_policy((CURL *)(uintptr_t)1) == CURLE_OK && policy_applied());
#if LIBCURL_VERSION_NUM >= 0x075500
    CHECK(record(CURLOPT_PROTOCOLS_STR) && strcmp(record(CURLOPT_PROTOCOLS_STR)->string, "https") == 0);
    CHECK(record(CURLOPT_REDIR_PROTOCOLS_STR) && strcmp(record(CURLOPT_REDIR_PROTOCOLS_STR)->string, "https") == 0);
#else
    CHECK(record(CURLOPT_PROTOCOLS) && record(CURLOPT_PROTOCOLS)->number == CURLPROTO_HTTPS);
    CHECK(record(CURLOPT_REDIR_PROTOCOLS) && record(CURLOPT_REDIR_PROTOCOLS)->number == CURLPROTO_HTTPS);
#endif
    fail_option = CURLOPT_PROXY; CHECK(http_apply_transport_policy((CURL *)(uintptr_t)1) != CURLE_OK); fail_option = 0;
    CHECK(set_option("CURLOPT_CAINFO", ca) == 1 && policy_applied());
    CHECK(set_option("CURLOPT_TIMEOUT_MS", "1500") == 1 && record(CURLOPT_TIMEOUT_MS)->number == 1500);
    CHECK(set_option("CURLOPT_CONNECTTIMEOUT_MS", "500") == 1 && record(CURLOPT_CONNECTTIMEOUT_MS)->number == 500);
    for (i = 0; i < sizeof(unsafe_options)/sizeof(*unsafe_options); i++)
        REFUSED(set_option(unsafe_options[i], "PUBLIC_COMPONENT_SENTINEL"), "mip_http_curl_option_refused");
    REFUSED(set_option("CURLOPT_TIMEOUT_MS", "0"), "mip_http_curl_option_refused");
    CHECK(strcmp(settable_curlopts[2].curlopt_val, "1500") == 0);
    REFUSED(set_option("CURLOPT_CAINFO", "/tmp/PUBLIC_COMPONENT_SENTINEL"), "mip_http_curl_option_refused");
    CHECK(strcmp(settable_curlopts[0].curlopt_val, ca) == 0);
    for (i = 0; i < 3; i++) {
        HeapTuple row = (HeapTuple)(uintptr_t)http_list_curlopt();
        CHECK(row && !row->nulls[0] && row->nulls[1] && !row->values[1]);
        CHECK(strncmp(((text *)(uintptr_t)row->values[0])->data, "CURLOPT_", 8) == 0);
    }
    CHECK(http_list_curlopt() == 0);
    CHECK(http_reset_curlopt() == 1 && !settable_curlopts[0].curlopt_val && !settable_curlopts[2].curlopt_val);
    CHECK(http_get_handle() && policy_applied() && record(CURLOPT_TIMEOUT_MS)->number == 5000 &&
          record(CURLOPT_CONNECTTIMEOUT_MS)->number == 1000);
    CHECK(init_calls == 1 && reset_calls > 0);
    argument_null[0] = true; CHECK(http_set_curlopt() == 0); argument_null[0] = false;
    fail_option = CURLOPT_SSL_VERIFYPEER; REFUSED(http_get_handle(), "mip_http_transport_refused"); fail_option = 0;
    g_http_handle = NULL; fail_init = true; REFUSED(http_get_handle(), "mip_http_transport_refused"); fail_init = false;
    REFUSED(http_error(CURLE_COULDNT_CONNECT, "PUBLIC_COMPONENT_SENTINEL"), "mip_http_transport_refused");
    headers = http_append_request_header(headers, "Authorization", "Bearer PUBLIC_COMPONENT_SENTINEL");
    CHECK(headers && strcmp(headers->data, "Authorization: Bearer PUBLIC_COMPONENT_SENTINEL") == 0 && append_calls == 1);
    REFUSED(http_append_request_header(headers, "X", "x\r\nInjected: value"), "mip_http_request_header_refused");
    REFUSED(http_append_request_header(headers, "Content-Type", "application/json\r\nInjected: value"), "mip_http_request_header_refused");
    CHECK(append_calls == 1);
    fail_append = true; REFUSED(http_append_request_header(headers, "X", "public"), "mip_http_request_header_refused"); fail_append = false;
    headers = NULL;
    for (i = 0; i < 32; i++) headers = http_append_request_header(headers, "X", "public");
    CHECK(headers && append_calls == 33);
    REFUSED(http_append_request_header(headers, "X", "public"), "mip_http_request_header_refused");
    CHECK(append_calls == 33);
    headers = NULL; oversized[8191] = 0;
    for (i = 0; i < 7; i++) headers = http_append_request_header(headers, "X", oversized);
    REFUSED(http_append_request_header(headers, "X", oversized), "mip_http_request_header_refused");
    release_allocations();
    printf("{\"checksPassed\":%d,\"componentOnly\":true,\"curlAndPostgreSQLAreAdapters\":true}\n", (int)checks);
    return 0;
}
