import {useEffect,useMemo,useRef,useState} from 'react'
import {createHypothesisHttpTransport} from './hypothesisHttpTransport.js'
import {createHypothesisAssessmentClient} from './hypothesisAssessmentClient.js'
// Optional application seam. Browser session data routes credentials; only the server authenticates authority.
export function useHypothesisSessionClient({endpoint=null,auth,active=false}={}){
 const user=auth?.user?.id,sessionUser=auth?.session?.user?.id,token=auth?.session?.access_token,expires=auth?.session?.expires_at
 const descriptor=useMemo(()=>({endpoint,user,sessionUser,token,expires,loading:auth?.loading,active}),
  [endpoint,user,sessionUser,token,expires,auth?.loading,active])
 const latest=useRef(descriptor),[binding,setBinding]=useState(null)
 latest.current=descriptor
 useEffect(()=>{
  let transport,timer,live=true
  const permitted=()=>live&&latest.current===descriptor&&descriptor.active===true&&descriptor.loading===false&&
   typeof descriptor.user==='string'&&descriptor.user.length>0&&descriptor.user===descriptor.sessionUser&&
   typeof descriptor.token==='string'&&descriptor.token.length>0&&Number.isFinite(descriptor.expires)&&descriptor.expires*1000>Date.now()
  if(!permitted()||!endpoint){setBinding(null);return()=>{live=false}}
  try{
   transport=createHypothesisHttpTransport({endpoint,getAccessToken:async()=>permitted()?descriptor.token:null})
   const scoped=async(action,input)=>{
    if(!permitted())return{data:null,error:{code:'authentication_required'}}
    const result=await transport(action,input)
    return permitted()?result:{data:null,error:{code:'authentication_required'}}
   }
   setBinding({descriptor,client:createHypothesisAssessmentClient(scoped)})
   const expire=()=>{
    if(!live)return
    const remaining=descriptor.expires*1000-Date.now()
    if(remaining>0){timer=setTimeout(expire,Math.min(remaining,2147483647));return}
    transport.dispose()
    setBinding(current=>current?.descriptor===descriptor?null:current)
   }
   expire()
  }catch{setBinding(null)}
  return()=>{live=false;clearTimeout(timer);transport?.dispose()}
 },[descriptor,endpoint])
 return binding?.descriptor===descriptor?binding.client:null
}
