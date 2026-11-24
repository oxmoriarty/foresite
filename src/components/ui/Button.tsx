import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Loader2 } from "lucide-react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "danger" | "ghost" | "pill";
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
      "inline-flex flex-row items-center justify-center font-medium rounded-xl whitespace-nowrap transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none disabled:hover:scale-100 select-none cursor-pointer";

    const variantStyles = {
      primary:
        "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 focus-visible:ring-brand-500 shadow-sm hover:shadow-pill",
      secondary:
        "bg-slate-900 text-white hover:bg-slate-800 active:bg-slate-950 focus-visible:ring-slate-700 shadow-sm",
      outline:
        "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 active:bg-slate-100 focus-visible:ring-brand-500 shadow-xs",
      danger:
        "bg-red-600 text-white hover:bg-red-700 active:bg-red-800 focus-visible:ring-red-500 shadow-sm",
      ghost:
        "text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200 focus-visible:ring-slate-400 hover:scale-100",
      pill:
        "rounded-full bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 focus-visible:ring-brand-500 shadow-pill font-semibold",
    };

    const sizeStyles = {
      sm: "text-xs px-3 py-1.5 gap-1.5",
      md: "text-sm px-4 py-2 gap-2",
      lg: "text-base px-6 py-3 gap-2.5",
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
        {loading && <Loader2 className="h-4 w-4 animate-spin text-current shrink-0" />}
        {!loading && icon && <span className="inline-flex shrink-0 items-center justify-center">{icon}</span>}
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap leading-none">{children}</span>
      </button>
    );
  }
);

Button.displayName = "Button";
