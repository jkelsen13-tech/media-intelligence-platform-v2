import React from 'react'
import {createRoot} from 'react-dom/client'
import App from '../../src/App.jsx'
import '../../src/index.css'
import '../../src/styles/news.css'
import {installFixtureBridge} from './fixture.mjs'
const root=createRoot(document.getElementById('root'))
installFixtureBridge(auth=>root.render(<App authSessionOverride={auth}/>))
