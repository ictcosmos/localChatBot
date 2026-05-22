import React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "glass";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", isLoading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
          {
            // Primary Indigo/Violet Gradient
            "bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-md shadow-indigo-600/10 hover:shadow-indigo-500/20 hover:scale-[1.01]":
              variant === "primary",
            // Secondary dark slate
            "bg-slate-800 hover:bg-slate-700 text-slate-100": variant === "secondary",
            // Glassmorphic outline
            "border border-slate-800 hover:bg-slate-900/60 hover:text-white text-slate-300": variant === "outline",
            // Ghost
            "hover:bg-slate-900/55 hover:text-slate-100 text-slate-400": variant === "ghost",
            // Danger
            "bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/10": variant === "danger",
            // Glassmorphic pure
            "bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 text-white": variant === "glass",
          },
          {
            "px-3 py-1.5 text-xs": size === "sm",
            "px-4 py-2 text-sm": size === "md",
            "px-6 py-3 text-base": size === "lg",
          },
          className
        )}
        {...props}
      >
        {isLoading ? (
          <>
            <svg
              className="mr-2 h-4 w-4 animate-spin text-current"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Loading...</span>
          </>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
