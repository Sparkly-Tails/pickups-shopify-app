'use client'

// Wraps a form submit button with a native confirm() before the submit
// goes through. Used for destructive Server Action forms (cancel
// subscription, reset cycle) — these fire immediately on tap otherwise,
// which is risky on a shared iPad passed between staff mid-interaction.
export default function ConfirmSubmitButton({
  confirmMessage,
  className,
  children,
}: {
  confirmMessage: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!confirm(confirmMessage)) {
          e.preventDefault()
        }
      }}
    >
      {children}
    </button>
  )
}
