import { useEffect } from 'react'
import { Outlet, Route, Routes } from 'react-router-dom'
import DemoBanner from './components/DemoBanner'
import ErrorBoundary from './components/ErrorBoundary'
import TabBar from './components/TabBar'
import { Toast, useToast } from './components/Toast'
import { useSettings } from './hooks'
import { applyAppTheme, applyTheme } from './lib/theme'
import { maybeAutoBackup } from './lib/githubBackup'
import { generateDueRecurringTransactions } from './db/recurring'

import AddScreen from './features/add/AddScreen'
import TransactionsScreen from './features/transactions/TransactionsScreen'
import EditTransactionScreen from './features/transactions/EditTransactionScreen'
import InsightsScreen from './features/insights/InsightsScreen'
import MoreScreen from './features/more/MoreScreen'
import AppearanceScreen from './features/more/AppearanceScreen'
import KeypadScreen from './features/more/KeypadScreen'
import DemoScreen from './features/more/DemoScreen'
import CategoriesScreen from './features/categories/CategoriesScreen'
import BudgetsScreen from './features/budgets/BudgetsScreen'
import BudgetDetailScreen from './features/budgets/BudgetDetailScreen'
import CurrenciesScreen from './features/settings/CurrenciesScreen'
import ImportScreen from './features/import/ImportScreen'
import DataScreen from './features/data/DataScreen'
import GitHubBackupScreen from './features/data/GitHubBackupScreen'
import RecurringScreen from './features/more/RecurringScreen'

function Layout({ toastMessage }: { toastMessage: string | null }) {
  return (
    <div className="mx-auto flex h-full max-w-lg flex-col bg-bg">
      <DemoBanner />
      <main className="min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </main>
      <TabBar />
      <Toast message={toastMessage} />
    </div>
  )
}

export default function App() {
  const settings = useSettings()
  const { message, show } = useToast()

  useEffect(() => {
    applyTheme(settings.theme)
    if (settings.theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [settings.theme])

  useEffect(() => {
    applyAppTheme(settings.appTheme)
  }, [settings.appTheme])

  useEffect(() => {
    void maybeAutoBackup()
    void generateDueRecurringTransactions().then((count) => {
      if (count > 0) show(`Added ${count} recurring transaction${count === 1 ? '' : 's'}`)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <ErrorBoundary>
      <Routes>
        <Route element={<Layout toastMessage={message} />}>
          <Route path="/" element={<AddScreen />} />
          <Route path="/transactions" element={<TransactionsScreen />} />
          <Route path="/insights" element={<InsightsScreen />} />
          <Route path="/more" element={<MoreScreen />} />
        </Route>
        <Route path="/tx/:id/edit" element={<EditTransactionScreen />} />
        <Route path="/more/categories" element={<CategoriesScreen />} />
        <Route path="/more/budgets" element={<BudgetsScreen />} />
        <Route path="/more/budgets/:id" element={<BudgetDetailScreen />} />
        <Route path="/more/recurring" element={<RecurringScreen />} />
        <Route path="/more/currencies" element={<CurrenciesScreen />} />
        <Route path="/more/appearance" element={<AppearanceScreen />} />
        <Route path="/more/keypad" element={<KeypadScreen />} />
        <Route path="/more/import" element={<ImportScreen />} />
        <Route path="/more/data" element={<DataScreen />} />
        <Route path="/more/github-backup" element={<GitHubBackupScreen />} />
        <Route path="/more/demo" element={<DemoScreen />} />
      </Routes>
    </ErrorBoundary>
  )
}
