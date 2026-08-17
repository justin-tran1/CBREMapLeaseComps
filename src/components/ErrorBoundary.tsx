import { Component, type ErrorInfo, type ReactNode } from 'react'
import { IconAlert, IconRefresh } from './Icons'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/** Keeps one bad row or one bad chart from blanking the whole tool. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Lease Comp Mapper crashed:', error, info.componentStack)
  }

  private reset = (): void => this.setState({ error: null })

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="empty-state" role="alert">
        <IconAlert size={26} />
        <div className="empty-state__title">Something went wrong rendering this view</div>
        <p className="small" style={{ maxWidth: '52ch', margin: 0 }}>
          {error.message || 'An unexpected error occurred.'} Your data is still loaded. Try clearing
          the filters, or reload the page and upload the file again.
        </p>
        <button type="button" className="btn" onClick={this.reset}>
          <IconRefresh size={14} />
          Try again
        </button>
      </div>
    )
  }
}
