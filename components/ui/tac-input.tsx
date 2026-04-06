import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/components/ui/utils'

export const TacInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'w-full bg-dr-bg border border-dr-border text-dr-text font-tactical text-base',
        'px-4 py-3 placeholder:text-dr-muted min-h-[44px]',
        'focus:border-dr-amber focus:outline-none',
        'disabled:opacity-70 disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    />
  ),
)
TacInput.displayName = 'TacInput'
