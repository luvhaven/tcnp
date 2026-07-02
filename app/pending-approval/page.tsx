import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default async function PendingApprovalPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
            <div className="max-w-md w-full bg-zinc-950 border border-white/5 p-8 rounded-2xl shadow-2xl text-center space-y-6">
                <div className="w-16 h-16 bg-orange-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-orange-500/20">
                    <div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
                </div>

                <h1 className="text-3xl font-bold text-white tracking-tight">Account Pending</h1>

                <div className="space-y-4 text-zinc-400">
                    <p>
                        Your account (<span className="text-white font-medium">{user.email}</span>) has been created successfully, but it requires approval from Command before you can access the operational dashboard.
                    </p>
                    <p>
                        Please contact your Team Lead or Command Center to expedite your activation.
                    </p>
                </div>

                <div className="pt-6 border-t border-white/5">
                    <form action="/auth/signout" method="post">
                        <Button type="submit" variant="outline" className="w-full gap-2 border-white/10 hover:bg-white/5">
                            <LogOut className="h-4 w-4" />
                            Sign Out
                        </Button>
                    </form>
                </div>
            </div>
        </div>
    )
}
