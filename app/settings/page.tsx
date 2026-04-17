import IntegrationsCard from '@/components/settings/IntegrationsCard'
import SummaryCard from '@/components/settings/SummaryCard'
import AppearanceCard from '@/components/settings/AppearanceCard'

export default function SettingsPage() {
  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <IntegrationsCard />
      <SummaryCard />
      <AppearanceCard />
    </main>
  )
}
