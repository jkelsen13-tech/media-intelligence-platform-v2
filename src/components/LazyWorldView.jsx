import { Component, lazy, Suspense, useMemo, useState } from 'react'

// The import remains fixed. No reader is invoked until the existing route mounts.
const loadWorldView = () => import('../views/WorldView.jsx')

class ViewLoadBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) return (
      <div className="notice error" role="alert">
        World View could not be opened.
        <button type="button" onClick={this.props.onRetry}>Try again</button>
      </div>
    )
    return this.props.children
  }
}

// Factory permits deterministic loading/failure fixtures without map or network access.
export function createLazyWorldView(loadView) {
  return function LazyWorldView(props) {
    const [attempt, setAttempt] = useState(0)
    const View = useMemo(() => lazy(loadView), [attempt])
    return (
      <ViewLoadBoundary key={attempt} onRetry={() => setAttempt(value => value + 1)}>
        <Suspense fallback={<div className="notice" role="status">Loading World View…</div>}>
          <View {...props} />
        </Suspense>
      </ViewLoadBoundary>
    )
  }
}

export default createLazyWorldView(loadWorldView)
