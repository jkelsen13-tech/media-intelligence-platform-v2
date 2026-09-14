import React from 'react'
import {createRoot} from 'react-dom/client'
import App from '../../src/App.jsx'
import {marketsPreview,marketsAuth,marketsEndpoint} from '../../tests/privateMarketsWorkspaceFixture.mjs'
const root=createRoot(document.getElementById('root')),preview=marketsPreview()
window.renderMarketsApp=({configured=true,token='synthetic-markets-current',signedOut=false}={})=>root.render(<App
 privateInvestigationPreview={preview} privateMarketsEndpoint={configured?marketsEndpoint:null}
 authSessionOverride={signedOut?{loading:false,user:null,session:null}:marketsAuth(token)}/>)
window.renderMarketsApp({configured:false})
