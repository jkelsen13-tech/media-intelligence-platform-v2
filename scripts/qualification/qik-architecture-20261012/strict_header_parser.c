/* Qualification candidate only. Bounded CRLF response-header grammar.
 * Caller supplies curl's complete header buffer, without CR normalization.
 * A single 201 block is admitted; interim/proxy/redirect blocks are refused.
 */
static ArrayType *
header_string_to_array(StringInfo si)
{
 Datum elements[HTTP_HEADER_MAX_COUNT];
 int count=0, offset=0, line_number=0;
 TupleDesc desc=NULL;
 Oid type;
 int16 len;
 bool byval;
 char align;
 if (si->len<=0 || si->len>65536 || memchr(si->data,'\0',si->len))
  elog(ERROR,"mip_http_response_header_refused");
 desc=typname_get_tupledesc("http","http_header");
 type=desc->tdtypeid;
 get_typlenbyvalalign(type,&len,&byval,&align);
 while (offset<si->len)
 {
  const char *start=si->data+offset;
  const char *cr=memchr(start,'\r',si->len-offset);
  size_t width;
  if (!cr || cr+1>=si->data+si->len || cr[1]!='\n')
   elog(ERROR,"mip_http_response_header_refused");
  width=(size_t)(cr-start);
  if (memchr(start,'\n',width))
   elog(ERROR,"mip_http_response_header_refused");
  offset+=(int)width+2;
  if (line_number++==0)
  {
   const char *status=NULL;
   size_t i;
   if (width>=12 && memcmp(start,"HTTP/1.1 201",12)==0) status=start+12;
   else if (width>=10 && memcmp(start,"HTTP/2 201",10)==0) status=start+10;
   else if (width>=10 && memcmp(start,"HTTP/3 201",10)==0) status=start+10;
   if (!status || width>127 || (status<cr && *status!=' '))
    elog(ERROR,"mip_http_response_header_refused");
   for (i=0;i<width;i++)
    if ((unsigned char)start[i]<32 || (unsigned char)start[i]>126)
     elog(ERROR,"mip_http_response_header_refused");
   continue;
  }
  if (!width)
  {
   if (offset!=si->len) elog(ERROR,"mip_http_response_header_refused");
   ReleaseTupleDesc(desc);
   return construct_array(elements,count,type,len,byval,align);
  }
  else
  {
   const char *colon=memchr(start,':',width);
   const char *value;
   size_t field_len,value_len;
   char field[HTTP_HEADER_FIELD_MAX_BYTES+1];
   char text_value[HTTP_HEADER_VALUE_MAX_BYTES+1];
   if (!colon || count>=HTTP_HEADER_MAX_COUNT)
    elog(ERROR,"mip_http_response_header_refused");
   field_len=(size_t)(colon-start);value=colon+1;
   while (value<cr && *value==' ')value++;
   value_len=(size_t)(cr-value);
   if (!field_len || field_len>HTTP_HEADER_FIELD_MAX_BYTES || !value_len || value_len>HTTP_HEADER_VALUE_MAX_BYTES)
    elog(ERROR,"mip_http_response_header_refused");
   memcpy(field,start,field_len);field[field_len]='\0';
   memcpy(text_value,value,value_len);text_value[value_len]='\0';
   if (!http_request_header_valid(field,text_value))
    elog(ERROR,"mip_http_response_header_refused");
   elements[count++]=header_tuple(desc,field,text_value);
  }
 }
 elog(ERROR,"mip_http_response_header_refused");
 return NULL;
}
