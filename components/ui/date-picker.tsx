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

interface DatePickerProps {
    value: string
    onChange: (value: string) => void
    placeholder?: string
    disabled?: boolean
}

/**
 * Simple date-only picker (no time)
 * Uses a beautiful calendar popover
 * Returns dates in YYYY-MM-DD format for database compatibility
 */
export function DatePicker({
    value,
    onChange,
    placeholder = "Pick a date",
    disabled = false,
}: DatePickerProps) {
    const [date, setDate] = React.useState<Date | undefined>(
        value ? new Date(value) : undefined
    )

    const handleDateSelect = (newDate: Date | undefined) => {
        if (!newDate) {
            setDate(undefined)
            onChange("")
            return
        }

        setDate(newDate)
        // Format as YYYY-MM-DD for database
        onChange(format(newDate, "yyyy-MM-dd"))
    }

    // Format display value as DD/MM/YYYY
    const displayValue = date ? format(date, "dd/MM/yyyy") : ""

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant={"outline"}
                    className={cn(
                        "w-full justify-start text-left font-normal",
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
            </PopoverContent>
        </Popover>
    )
}
