"use client"

import { useState } from "react"
import { ShieldCheck, Lock, Loader2, KeyRound, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

export default function ChangePasswordPage() {
    const router = useRouter()
    const supabase = createClient()
    const [loading, setLoading] = useState(false)
    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault()

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
            const { error } = await supabase.auth.updateUser({
                password: password
            })

            if (error) throw error

            toast.success("Password updated successfully! You are still logged in.")
            setPassword("")
            setConfirmPassword("")
        } catch (error: any) {
            toast.error(error.message || "Failed to update password")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="space-y-6 max-w-lg mx-auto">
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={() => router.back()} className="h-8 w-8">
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Change Password</h1>
                    <p className="text-sm text-muted-foreground">Update your account credentials</p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-primary" />
                        Set New Password
                    </CardTitle>
                    <CardDescription>
                        Enter a new secure password below. You will stay logged in after updating.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handlePasswordChange} className="space-y-5">
                        <div className="space-y-2">
                            <Label htmlFor="new-password">New Password</Label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="new-password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="pl-9"
                                    placeholder="Minimum 8 characters"
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="confirm-password">Confirm Password</Label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="confirm-password"
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="pl-9"
                                    placeholder="Re-type your new password"
                                    required
                                />
                            </div>
                        </div>

                        {password && confirmPassword && password !== confirmPassword && (
                            <p className="text-sm text-destructive">Passwords do not match</p>
                        )}
                        {password && password.length > 0 && password.length < 8 && (
                            <p className="text-sm text-destructive">Password must be at least 8 characters</p>
                        )}

                        <Button
                            type="submit"
                            disabled={loading || !password || !confirmPassword || password !== confirmPassword || password.length < 8}
                            className="w-full"
                        >
                            {loading ? (
                                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Updating...</>
                            ) : (
                                <><KeyRound className="h-4 w-4 mr-2" /> Update Password</>
                            )}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
