'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { differenceInDays, addDays, isPast } from 'date-fns'
import { Eye, EyeOff } from 'lucide-react'
import { useRouter } from 'next/navigation'

export function PasswordEnforcer() {
    const [mustChange, setMustChange] = useState(false)
    const [newPassword, setNewPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [showPassword, setShowPassword] = useState(false)

    const supabase = useMemo(() => createClient(), [])
    const router = useRouter()

    useEffect(() => {
        const checkSecurityPolicy = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data: userData } = await supabase
                .from('users')
                .select('password_last_changed, password_last_notified')
                .eq('id', user.id)
                .single() as any

            if (!userData) return

            const lastChanged = userData.password_last_changed ? new Date(userData.password_last_changed) : new Date(0)
            const daysSinceChange = differenceInDays(new Date(), lastChanged)

            // 1. Mandatory Expiry check
            if (daysSinceChange >= 180) {
                setMustChange(true)
                return
            }

            // 2. Notification check (starts at 150 days)
            if (daysSinceChange >= 150) {
                const lastNotified = userData.password_last_notified ? new Date(userData.password_last_notified) : null

                let shouldNotify = false
                if (!lastNotified) {
                    shouldNotify = true
                } else {
                    // Notify every 3 days
                    const nextNotificationDue = addDays(lastNotified, 3)
                    if (isPast(nextNotificationDue)) {
                        shouldNotify = true
                    }
                }

                if (shouldNotify) {
                    const daysLeft = 180 - daysSinceChange
                    toast.warning(`Security Alert: Your password expires in ${daysLeft} days. Please update it in your profile soon.`, {
                        duration: 10000,
                        position: 'top-center'
                    })

                    // Mark notified
                    await (supabase as any)
                        .from('users')
                        .update({ password_last_notified: new Date().toISOString() })
                        .eq('id', user.id)
                }
            }
        }

        checkSecurityPolicy()
    }, [supabase])

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault()
        if (newPassword.length < 6) {
            toast.error('Password must be at least 6 characters')
            return
        }

        setLoading(true)
        try {
            const res = await fetch('/api/auth/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ new_password: newPassword })
            })

            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed to change password')

            toast.success('Password updated successfully! Redirecting...')
            setMustChange(false)

            // Logout and force fresh login to clear old session state completely
            await supabase.auth.signOut()
            router.replace('/login')

        } catch (err: any) {
            console.error(err)
            toast.error(err.message || 'An error occurred while changing password')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={mustChange} onOpenChange={() => { }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-red-500 font-bold">Mandatory Password Rotation</DialogTitle>
                    <DialogDescription>
                        Your password was last changed over 180 days ago and has expired in compliance with TCNP security policies. You must change it immediately to continue.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleChangePassword} className="space-y-6 mt-4">
                    <div className="space-y-2">
                        <Label htmlFor="new-password">New Security Key</Label>
                        <div className="relative">
                            <Input
                                id="new-password"
                                type={showPassword ? 'text' : 'password'}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="Enter new 6+ char password"
                                required
                                className="pr-10"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                            >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>

                    <Button type="submit" className="w-full bg-red-600 hover:bg-red-700 text-white" disabled={loading}>
                        {loading ? 'Updating Security Key...' : 'Update Password securely'}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    )
}
