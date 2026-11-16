"use client"

import { useState } from "react"
import { ShieldCheck, Lock, Loader2, KeyRound, ArrowLeft, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { notifyError } from '@/lib/notify'
import { useRouter } from "next/navigation"
import { startForgotPasswordFlow } from '@/lib/password-reset-handoff'

/** A password input with a lock icon and a show/hide toggle. */
function PasswordField({
    id, label, value, onChange, autoComplete, placeholder, describedBy, invalid, labelAction,
}: {
    id: string
    label: string
    value: string
    onChange: (value: string) => void
    autoComplete: string
    placeholder?: string
    describedBy?: string
    invalid?: boolean
    labelAction?: React.ReactNode
}) {
    const [visible, setVisible] = useState(false)
    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor={id}>{label}</Label>
                {labelAction}
            </div>
            <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                    id={id}
                    type={visible ? "text" : "password"}
                    autoComplete={autoComplete}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="h-10 pl-9 pr-11"
                    placeholder={placeholder}
                    aria-describedby={describedBy}
                    aria-invalid={invalid || undefined}
                    required
                />
                <button
                    type="button"
                    onClick={() => setVisible(v => !v)}
                    aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
                    aria-pressed={visible}
                    aria-controls={id}
                    className="absolute right-0.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                    {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                </button>
            </div>
        </div>
    )
}

export default function ChangePasswordPage() {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [currentPassword, setCurrentPassword] = useState("")
    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")

    const tooShort = password.length > 0 && password.length < 8
    const mismatch = Boolean(password && confirmPassword && password !== confirmPassword)

    // Opened directly (a bookmark, a new tab) there is nothing to go back to,
    // so "back" goes to Settings, where this page is linked from.
    const goBack = () => {
        if (window.history.length > 1) router.back()
        else router.push("/settings")
    }

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!currentPassword) {
            toast.error("Enter your current password")
            return
        }

        if (password.length < 8) {
            toast.error("Password must be at least 8 characters long")
            return
        }

        if (password !== confirmPassword) {
            toast.error("Passwords do not match")
            return
        }

        setLoading(true)

        try {
            const res = await fetch("/api/auth/change-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ current_password: currentPassword, new_password: password })
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || "Failed to update password")

            toast.success("Password updated successfully! You are still logged in.")
            setCurrentPassword("")
            setPassword("")
            setConfirmPassword("")
        } catch (error: any) {
            notifyError(error, "Failed to update password")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="space-y-6 max-w-lg mx-auto">
            <PageHeader
                title="Change Password"
                description="Update your account credentials."
                leading={
                    <Button aria-label="Go back" variant="ghost" size="icon" onClick={goBack} className="h-10 w-10 shrink-0">
                        <ArrowLeft aria-hidden="true" />
                    </Button>
                }
            />

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
                        Set New Password
                    </CardTitle>
                    <CardDescription>
                        Enter a new secure password below. You will stay logged in after updating.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handlePasswordChange} className="space-y-5">
                        <PasswordField
                            id="current-password"
                            label="Current Password"
                            value={currentPassword}
                            onChange={setCurrentPassword}
                            autoComplete="current-password"
                            labelAction={
                                <button
                                    type="button"
                                    onClick={() => { void startForgotPasswordFlow() }}
                                    className="-mr-2 inline-flex h-9 items-center rounded-md px-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                                >
                                    Forgot password?
                                </button>
                            }
                        />

                        <PasswordField
                            id="new-password"
                            label="New Password"
                            value={password}
                            onChange={setPassword}
                            autoComplete="new-password"
                            placeholder="Minimum 8 characters"
                            describedBy={tooShort ? "new-password-error" : undefined}
                            invalid={tooShort}
                        />

                        <PasswordField
                            id="confirm-password"
                            label="Confirm Password"
                            value={confirmPassword}
                            onChange={setConfirmPassword}
                            autoComplete="new-password"
                            placeholder="Re-type your new password"
                            describedBy={mismatch ? "confirm-password-error" : undefined}
                            invalid={mismatch}
                        />

                        {mismatch && (
                            <p id="confirm-password-error" className="text-sm text-destructive dark:text-red-400">Passwords do not match</p>
                        )}
                        {tooShort && (
                            <p id="new-password-error" className="text-sm text-destructive dark:text-red-400">Password must be at least 8 characters</p>
                        )}

                        <Button
                            type="submit"
                            disabled={loading || !currentPassword || !password || !confirmPassword || password !== confirmPassword || password.length < 8}
                            className="w-full"
                        >
                            {loading ? (
                                <><Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" /> Updating...</>
                            ) : (
                                <><KeyRound className="h-4 w-4 mr-2" aria-hidden="true" /> Update Password</>
                            )}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
