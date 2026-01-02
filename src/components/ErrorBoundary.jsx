// --- Error Boundary Component ---

import React from 'react';
import { AlertTriangle, RefreshCw, Download } from 'lucide-react';

/**
 * Error Boundary - Catches React errors and shows recovery UI
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // Could log to external service here
    console.error('FOSSIL Error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  handleExportData = () => {
    try {
      const data = localStorage.getItem('fossil-vault-v2');
      if (data) {
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fossil-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error('Export failed:', e);
    }
  };

  handleClearAndReset = () => {
    if (window.confirm('This will clear all data and reload. Are you sure? (Export your data first!)')) {
      localStorage.removeItem('fossil-vault-v2');
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-zinc-900 border border-red-900/50 rounded-2xl p-8 space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-950/50 rounded-xl">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <h1 className="text-xl font-mono font-bold text-white">
                  Something went wrong
                </h1>
                <p className="text-sm text-zinc-500 font-mono">
                  FOSSIL encountered an error
                </p>
              </div>
            </div>

            {/* Error Details */}
            <div className="bg-black/50 border border-zinc-800 rounded-lg p-4">
              <p className="text-xs font-mono text-red-400 break-all">
                {this.state.error?.message || 'Unknown error'}
              </p>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <button
                onClick={this.handleReset}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Reload App
              </button>

              <button
                onClick={this.handleExportData}
                className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-sm rounded-lg transition-colors flex items-center justify-center gap-2 border border-zinc-700"
              >
                <Download className="w-4 h-4" />
                Export Data Backup
              </button>

              <button
                onClick={this.handleClearAndReset}
                className="w-full py-2 text-red-500 hover:text-red-400 font-mono text-xs transition-colors"
              >
                Clear data and reset (last resort)
              </button>
            </div>

            {/* Help */}
            <p className="text-[10px] text-zinc-600 font-mono text-center">
              If this keeps happening, export your data and report the issue at{' '}
              <a
                href="https://github.com/DanielTeshager/fossil/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-600 hover:underline"
              >
                GitHub
              </a>
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
