import { useEffect } from 'react'
import { Outlet, Route, Routes } from 'react-router-dom'
import TabBar from './components/TabBar'
import { useSettings } from './hooks'
import { applyTheme } from './lib/theme'

import AddScreen from './features/add/AddScreen'
import TransactionsScreen from './features/transactions/TransactionsScreen'
import EditTransactionScreen from './features/transactions/EditTransactionScreen'
import InsightsScreen from './features/insights/InsightsScreen'
import MoreScreen from './features/more/MoreScreen'
import AppearanceScreen from './features/more/AppearanceScreen'
import KeypadScreen from './features/more/KeypadScreen'
import CategoriesScreen from './features/categories/CategoriesScreen'
import BudgetsScreen from './features/budgets/BudgetsScreen'
import CurrenciesScreen from './features/settings/CurrenciesScreen'
import ImportScreen from './features/import/ImportScreen'
import DataScreen from './features/data/DataScreen'

function Layout() {
  return (
    <div className="mx-auto flex h-full max-w-lg flex-col bg-bg">
      <main className="min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </main>
      <TabBar />
    </div>
  )
}

export default function App() {
  const settings = useSettings()

  useEffect(() => {
    applyTheme(settings.theme)
    if (settings.theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [settings.theme])

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<AddScreen />} />
        <Route path="/transactions" element={<TransactionsScreen />} />
        <Route path="/insights" element={<InsightsScreen />} />
        <Route path="/more" element={<MoreScreen />} />
      </Route>
      <Route path="/tx/:id/edit" element={<EditTransactionScreen />} />
      <Route path="/more/categories" element={<CategoriesScreen />} />
      <Route path="/more/budgets" element={<BudgetsScreen />} />
      <Route path="/more/currencies" element={<CurrenciesScreen />} />
      <Route path="/more/appearance" element={<AppearanceScreen />} />
      <Route path="/more/keypad" element={<KeypadScreen />} />
      <Route path="/more/import" element={<ImportScreen />} />
      <Route path="/more/data" element={<DataScreen />} />
    </Routes>
  )
}
