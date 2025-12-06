'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { MapPin, Settings } from 'lucide-react'

interface LocationPermissionModalProps {
    isOpen: boolean
    onAllow: () => void
    onDeny: () => void
    permissionStatus: PermissionState | 'unknown' | null
}

export function LocationPermissionModal({
    isOpen,
    onAllow,
    onDeny,
    permissionStatus
}: LocationPermissionModalProps) {
    const [isDenied, setIsDenied] = useState(false)

    useEffect(() => {
        if (permissionStatus === 'denied') {
            setIsDenied(true)
        } else {
            setIsDenied(false)
        }
    }, [permissionStatus])

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onDeny()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <div className="mx-auto bg-primary/10 p-3 rounded-full mb-4 w-fit">
                        {isDenied ? (
                            <Settings className="h-8 w-8 text-primary" />
                        ) : (
                            <MapPin className="h-8 w-8 text-primary" />
                        )}
                    </div>
                    <DialogTitle className="text-center text-xl">
                        {isDenied ? 'Enable Location Access' : 'Enable Live Tracking'}
                    </DialogTitle>
                    <DialogDescription className="text-center pt-2">
                        {isDenied ? (
                            <span>
                                Location access is currently blocked. Please enable it in your browser settings to use Live Tracking.
                            </span>
                        ) : (
                            <span>
                                To show your position on the map and share it with your team, we need access to your location.
                            </span>
                        )}
                    </DialogDescription>
                </DialogHeader>

                <DialogFooter className="flex-col sm:justify-center gap-2 mt-4">
                    {isDenied ? (
                        <div className="flex flex-col gap-2 w-full">
                            <div className="text-xs text-muted-foreground bg-muted p-3 rounded-md text-center mb-2">
                                Click the lock icon 🔒 or settings icon in your address bar to reset permissions.
                            </div>
                            <Button onClick={onAllow} className="w-full">
                                I've Enabled It, Try Again
                            </Button>
                        </div>
                    ) : (
                        <>
                            <Button onClick={onAllow} className="w-full" size="lg">
                                Allow Location Access
                            </Button>
                            <Button variant="ghost" onClick={onDeny} className="w-full">
                                Not Now
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
