#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define RVSZ 8192
#define ERROR 1
#define elog(level,message) do { (void)(level); (void)(message); return false; } while(0)
#define regfree(value) ((void)(value))
typedef struct {char *data; int len; int cursor;} Input;
static bool copy_components(Input *si,int eo0,int so1,int eo1,int so2,int eo2) {
 int regex=0; char rv1[RVSZ];char rv2[RVSZ];
		/* Reserve the terminator and refuse invalid/oversized matches. */
		if ( si->cursor < 0 || si->cursor > si->len ||
		     eo0 <= 0 || eo0 > si->len - si->cursor ||
		     so1 < 0 || eo1 <= so1 || eo1 > eo0 || eo1 - so1 >= RVSZ ||
		     so2 < 0 || eo2 <= so2 || eo2 > eo0 || eo2 - so2 >= RVSZ )
		{
			regfree(&regex);
			elog(ERROR, "mip_http_response_header_refused");
		}

		/* Copy the matched portions out of the string */
		memcpy(rv1, si->data+si->cursor+so1, eo1-so1);
		rv1[eo1-so1] = '\0';
		memcpy(rv2, si->data+si->cursor+so2, eo2-so2);
		rv2[eo2-so2] = '\0';
 return strlen(rv1)==(size_t)(eo1-so1) && strlen(rv2)==(size_t)(eo2-so2);
}
int main(void) {
 char input[20000]; memset(input,'x',sizeof(input)); Input s={input,(int)sizeof(input),0};
 int cases=0;
 #define CHECK(expression) do { if (!(expression)) return 2;cases++; } while(0)
 CHECK(copy_components(&s,9000,0,8191,8192,8197));
 CHECK(copy_components(&s,9000,0,5,6,8197));
 CHECK(!copy_components(&s,9000,0,8192,8193,8198));
 CHECK(!copy_components(&s,9000,0,8193,8194,8199));
 CHECK(!copy_components(&s,9000,0,5,6,8198));
 CHECK(!copy_components(&s,9000,0,5,6,8199));
 CHECK(!copy_components(&s,9000,-1,4,6,11));
 CHECK(!copy_components(&s,9000,5,4,6,11));
 CHECK(!copy_components(&s,9000,0,5,-1,4));
 CHECK(!copy_components(&s,9000,0,5,6,5));
 CHECK(!copy_components(&s,10,0,5,6,11));
 s.cursor=20001;CHECK(!copy_components(&s,10,0,5,6,11));
 s.cursor=0;CHECK(!copy_components(&s,20001,0,5,6,11));
 CHECK(!copy_components(&s,0,0,5,6,11));
 printf("{\"checksPassed\":%d,\"componentOnly\":true}\n",cases); return 0;
}
