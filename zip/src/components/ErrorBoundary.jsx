import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught React Error caught by ErrorBoundary:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    if (window.electronAPI?.hardRefresh) {
      window.electronAPI.hardRefresh();
    } else {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6 text-slate-800">
          <div className="bg-white border border-slate-200 shadow-xl rounded-2xl p-6 sm:p-8 max-w-lg w-full space-y-5 text-center">
            <div className="text-4xl">⚠️</div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-900">
                Something went wrong
              </h2>
              <p className="text-xs text-slate-500">
                An unexpected error occurred in the application interface.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-left max-h-36 overflow-y-auto">
                <div className="text-xs font-mono text-rose-600 font-semibold break-all">
                  {this.state.error.toString()}
                </div>
              </div>
            )}

            <div className="pt-2">
              <button
                onClick={this.handleReload}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm py-2.5 px-4 rounded-xl shadow-2xs transition-colors"
              >
                ↻ Reload POS App
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
