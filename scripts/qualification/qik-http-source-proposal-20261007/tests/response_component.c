#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
typedef struct {int len;unsigned char *data;} StringInfoData;
typedef StringInfoData *StringInfo;
static int append_calls;
static void appendBinaryStringInfo(StringInfo s,const char *data,int n) {
 assert(n>=0 && s->len>=0 && n<=65536-s->len); memcpy(s->data+s->len,data,(size_t)n);s->len+=n;append_calls++;
}
static size_t
http_writeback(void *contents, size_t size, size_t nmemb, void *userp)
{
	StringInfo si = (StringInfo)userp;
	/* Audit responses are minimal. Bound each header/body buffer to 64KiB. */
	const size_t max_response_bytes = 64 * 1024;
	size_t realsize;
	if ( size && nmemb > max_response_bytes / size )
		return 0;
	realsize = size * nmemb;
	if ( si->len < 0 || (size_t)si->len > max_response_bytes ||
	     realsize > max_response_bytes - (size_t)si->len )
		return 0;
	appendBinaryStringInfo(si, (const char*)contents, (int)realsize);
	return realsize;
}

int main(void) {
 unsigned char input[65536],buffer[65536];memset(input,'x',sizeof(input));StringInfoData s={0,buffer};int checks=0;
 #define CHECK(x) do {if(!(x))return 2;checks++;}while(0)
 CHECK(http_writeback(input,1,65536,&s)==65536 && s.len==65536 && append_calls==1);
 CHECK(http_writeback(input,1,1,&s)==0 && s.len==65536 && append_calls==1);
 s.len=0;append_calls=0;CHECK(http_writeback(input,1,65537,&s)==0 && s.len==0 && append_calls==0);
 CHECK(http_writeback(input,SIZE_MAX,2,&s)==0 && append_calls==0);
 CHECK(http_writeback(input,2,SIZE_MAX,&s)==0 && append_calls==0);
 CHECK(http_writeback(input,65537,1,&s)==0 && append_calls==0);
 CHECK(http_writeback(input,0,SIZE_MAX,&s)==0 && s.len==0);
 append_calls=0;s.len=-1;CHECK(http_writeback(input,1,1,&s)==0 && append_calls==0);
 s.len=65537;CHECK(http_writeback(input,1,1,&s)==0 && append_calls==0);
 s.len=65535;CHECK(http_writeback(input,1,1,&s)==1 && s.len==65536 && append_calls==1);
 printf("{\"checksPassed\":%d}\n",checks);return 0;
}
