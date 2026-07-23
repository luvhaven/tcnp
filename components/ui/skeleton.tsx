import { cn } from "@/lib/utils"

function Skeleton({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        // `.skeleton` (globals.css) = directional shimmer sweep — reads as
        // "loading" far better than a static opacity pulse
        <div
            className={cn("skeleton rounded-md", className)}
            {...props}
        />
    )
}

export { Skeleton }
