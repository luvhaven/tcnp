"use client"

import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"

interface DateTimePickerProps {
    value: string
    onChange: (value: string) => void
    placeholder?: string
    disabled?: boolean
}

export function DateTimePicker({
    value,
    onChange,
    placeholder = "Pick a date and time",
    disabled = false,
}: DateTimePickerProps) {
    const [date, setDate] = React.useState<Date | undefined>(
        value ? new Date(value) : undefined
    )
    const [time, setTime] = React.useState<string>(
        value ? format(new Date(value), "HH:mm") : "12:00"
    )

    const handleDateSelect = (newDate: Date | undefined) => {
        if (!newDate) {
            setDate(undefined)
            onChange("")
            return
        }

        setDate(newDate)

        // Combine date and time
        const [hours, minutes] = time.split(":")
        newDate.setHours(parseInt(hours), parseInt(minutes))

        // Format as ISO string for database
        onChange(newDate.toISOString())
    }

    const handleTimeChange = (newTime: string) => {
        setTime(newTime)

        if (date) {
            const [hours, minutes] = newTime.split(":")
            const newDate = new Date(date)
            newDate.setHours(parseInt(hours), parseInt(minutes))
            onChange(newDate.toISOString())
        }
    }

    // Format display value as DD/MM/YYYY HH:mm
    const displayValue = date
        ? `${format(date, "dd/MM/yyyy")} ${time}`
        : ""

    return (
        <div className="flex gap-2">
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        variant={"outline"}
                        className={cn(
                            "flex-1 justify-start text-left font-normal",
                            !date && "text-muted-foreground"
                        )}
                        disabled={disabled}
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {displayValue || placeholder}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                        mode="single"
                        selected={date}
                        onSelect={handleDateSelect}
                        initialFocus
                    />
                    <div className="p-3 border-t">
                        <Label className="text-sm font-medium mb-2 block">Time</Label>
                        <Input
                            type="time"
                            value={time}
                            onChange={(e) => handleTimeChange(e.target.value)}
                            className="w-full"
                        />
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    )
}

// Simple label component if not imported
function Label({ className, children, ...props }: React.HTMLAttributes<HTMLLabelElement>) {
    return (
        <label className={cn("text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", className)} {...props}>
            {children}
        </label>
    )
}
