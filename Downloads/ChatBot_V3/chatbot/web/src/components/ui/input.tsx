import React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", label, error, ...props }, ref) => {
    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            {label}
          </label>
        )}
        <input
          type={type}
          ref={ref}
          className={cn(
            "w-full rounded-lg bg-slate-900 border border-slate-800 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 transition-all duration-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
            {
              "border-rose-500 focus:border-rose-500 focus:ring-rose-500/20": error,
            },
            className
          )}
          {...props}
        />
        {error && (
          <span className="text-xs font-medium text-rose-500 animate-fadeIn">
            {error}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
