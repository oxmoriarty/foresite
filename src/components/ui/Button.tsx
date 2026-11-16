import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Loader2 } from "lucide-react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      children,
      icon,
      type = "button",
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none select-none";

    const variantStyles = {
      primary:
        "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 focus-visible:ring-brand-500 shadow-sm",
      secondary:
        "bg-slate-800 text-white hover:bg-slate-900 active:bg-slate-950 focus-visible:ring-slate-700 shadow-sm",
      outline:
        "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 active:bg-slate-100 focus-visible:ring-brand-500",
      danger:
        "bg-red-600 text-white hover:bg-red-700 active:bg-red-800 focus-visible:ring-red-500 shadow-sm",
      ghost:
        "text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200 focus-visible:ring-slate-400",
    };

    const sizeStyles = {
      sm: "text-xs px-2.5 py-1.5 gap-1.5",
      md: "text-sm px-4 py-2 gap-2",
      lg: "text-base px-5 py-2.5 gap-2.5",
    };

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        className={twMerge(
          clsx(baseStyles, variantStyles[variant], sizeStyles[size], className)
        )}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin text-current" />}
        {!loading && icon && <span className="shrink-0">{icon}</span>}
        <span>{children}</span>
      </button>
    );
  }
);

Button.displayName = "Button";
