import {useEffect,useMemo,useRef,useState} from 'react'
import {createPrivateMarketsClient} from './privateMarketsClient.js'
import {createPrivateMarketsHttpTransport} from './privateMarketsHttpTransport.js'
// View-scoped lifetime only. Session data selects credentials; server owns authority.
export function usePrivateMarketsRead({endpoint=null,auth,active=false,input=null,expectedObservationId=null,revision=0,onAccessFailure}={}){
 const user=auth?.user?.id,sessionUser=auth?.session?.user?.id,token=auth?.session?.access_token,expires=auth?.session?.expires_at,loading=auth?.loading
 const binding=useMemo(()=>({endpoint,user,sessionUser,token,expires,loading,active,input,expectedObservationId,revision}),
  [endpoint,user,sessionUser,token,expires,loading,active,input,expectedObservationId,revision])
 const latest=useRef(binding),failure=useRef(onAccessFailure),[state,setState]=useState(null)
 latest.current=binding;failure.current=onAccessFailure
 useEffect(()=>{
  let live=true,client,timer
  const current=()=>live&&latest.current===binding
  const permitted=()=>current()&&loading===false&&typeof user==='string'&&user.length>0&&user===sessionUser&&
   typeof token==='string'&&token.length>0&&Number.isFinite(expires)&&expires*1000>Date.now()
  const accept=(status,data=null,code=null)=>{
   if(!current())return
   setState({binding,status,data,code})
   if(['authentication_required','access_denied'].includes(code))failure.current?.(code)
  }
  if(!active||!input||!endpoint){setState(null);return()=>{live=false}}
  if(!permitted()){accept('unavailable',null,'authentication_required');return()=>{live=false}}
  try{
   client=createPrivateMarketsClient({transport:createPrivateMarketsHttpTransport({endpoint,getAccessToken:async()=>permitted()?token:null})})
   accept('loading')
   client.read(input,{expectedObservationId}).then(result=>{
    if(!current())return
    if(!permitted()){accept('unavailable',null,'authentication_required');return}
    if(result.error?.code==='request_cancelled')return
    accept(result.error?'unavailable':'ready',result.data??null,result.error?.code??null)
   })
   const expire=()=>{
    if(!current())return
    const remaining=expires*1000-Date.now()
    if(remaining>0){timer=setTimeout(expire,Math.min(remaining,2147483647));return}
    client.dispose();accept('unavailable',null,'authentication_required')
   }
   expire()
  }catch{accept('unavailable',null,'not_configured')}
  return()=>{live=false;clearTimeout(timer);client?.dispose()}
 },[binding])
 return state?.binding===binding?state:{status:active&&input?'loading':'idle',data:null,code:null}
}
