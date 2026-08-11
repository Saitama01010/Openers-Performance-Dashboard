"use client";

import * as React from "react";
import { mergeProps } from "@base-ui-components/react/merge-props";
import { useRender } from "@base-ui-components/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex items-center justify-center border border-transparent font-medium whitespace-nowrap focus:outline-hidden focus:ring-2 focus:ring-[var(--focus)] focus:ring-offset-2 [&_svg]:-ms-px [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground",
        secondary: "bg-[var(--surface-subtle)] text-foreground",
        success: "bg-success text-white",
        warning: "bg-warning text-white",
        info: "bg-[#7656d6] text-white",
        outline: "border-border bg-transparent text-foreground",
        destructive: "bg-danger text-white",
      },
      appearance: {
        default: "",
        light: "",
        outline: "",
        ghost: "border-transparent bg-transparent",
      },
      disabled: {
        true: "pointer-events-none opacity-50",
      },
      size: {
        lg: "h-7 min-w-7 gap-1.5 rounded-md px-2 text-xs [&_svg]:size-3.5",
        md: "h-6 min-w-6 gap-1.5 rounded-md px-[0.45rem] text-xs [&_svg]:size-3.5",
        sm: "h-5 min-w-5 gap-1 rounded-sm px-[0.325rem] text-[0.6875rem] leading-3 [&_svg]:size-3",
        xs: "h-4 min-w-4 gap-1 rounded-sm px-1 text-[0.625rem] leading-2 [&_svg]:size-3",
      },
      shape: {
        default: "",
        circle: "rounded-full",
      },
    },
    compoundVariants: [
      { variant: "primary", appearance: "light", className: "bg-[var(--primary-subtle)] text-primary" },
      { variant: "secondary", appearance: "light", className: "bg-[var(--surface-subtle)] text-muted" },
      { variant: "success", appearance: "light", className: "bg-[var(--success-subtle)] text-success" },
      { variant: "warning", appearance: "light", className: "bg-[var(--warning-subtle)] text-warning" },
      { variant: "info", appearance: "light", className: "bg-[#f1edff] text-[#6842b8]" },
      { variant: "destructive", appearance: "light", className: "bg-[var(--danger-subtle)] text-danger" },
      { variant: "primary", appearance: "outline", className: "border-[#c9d8ff] bg-[var(--primary-subtle)] text-primary" },
      { variant: "secondary", appearance: "outline", className: "border-border bg-[var(--surface-subtle)] text-muted" },
      { variant: "success", appearance: "outline", className: "border-[#b9e6d3] bg-[var(--success-subtle)] text-success" },
      { variant: "warning", appearance: "outline", className: "border-[#f1d49b] bg-[var(--warning-subtle)] text-warning" },
      { variant: "info", appearance: "outline", className: "border-[#d8cdf6] bg-[#f1edff] text-[#6842b8]" },
      { variant: "destructive", appearance: "outline", className: "border-[#efc2bd] bg-[var(--danger-subtle)] text-danger" },
      { variant: "primary", appearance: "ghost", className: "text-primary" },
      { variant: "secondary", appearance: "ghost", className: "text-muted" },
      { variant: "success", appearance: "ghost", className: "text-success" },
      { variant: "warning", appearance: "ghost", className: "text-warning" },
      { variant: "info", appearance: "ghost", className: "text-[#6842b8]" },
      { variant: "destructive", appearance: "ghost", className: "text-danger" },
      { appearance: "ghost", size: "lg", className: "px-0" },
      { appearance: "ghost", size: "md", className: "px-0" },
      { appearance: "ghost", size: "sm", className: "px-0" },
      { appearance: "ghost", size: "xs", className: "px-0" },
    ],
    defaultVariants: {
      appearance: "default",
      size: "md",
      variant: "primary",
    },
  },
);

const badgeButtonVariants = cva(
  "-me-0.5 inline-flex size-3.5 cursor-pointer items-center justify-center rounded-md p-0 leading-none opacity-60 transition-opacity hover:opacity-100 [&>svg]:size-3.5 [&>svg]:opacity-100",
);

export interface BadgeProps extends useRender.ComponentProps<"span">, VariantProps<typeof badgeVariants> {
  asChild?: boolean;
}

export interface BadgeButtonProps extends useRender.ComponentProps<"button">, VariantProps<typeof badgeButtonVariants> {
  asChild?: boolean;
}

export type BadgeDotProps = React.HTMLAttributes<HTMLSpanElement>;

export function Badge({ render, asChild = false, children, className, variant, size, appearance, shape, disabled, ...props }: BadgeProps) {
  const defaultProps = {
    className: cn(badgeVariants({ appearance, disabled, shape, size, variant }), className),
    "data-slot": "badge",
  };
  const renderElement = asChild && React.isValidElement(children)
    ? children as React.ReactElement<Record<string, unknown>, string | React.JSXElementConstructor<unknown>>
    : render || <span />;
  const finalProps = asChild && React.isValidElement(children)
    ? mergeProps(defaultProps, props)
    : mergeProps(defaultProps, { ...props, children });

  return useRender({ props: finalProps, render: renderElement });
}

export function BadgeButton({ render, asChild = false, children, className, ...props }: BadgeButtonProps) {
  const defaultProps = {
    className: cn(badgeButtonVariants(), className),
    "data-slot": "badge-button",
    role: "button" as const,
  };
  const renderElement = asChild && React.isValidElement(children)
    ? children as React.ReactElement<Record<string, unknown>, string | React.JSXElementConstructor<unknown>>
    : render || <button />;
  const finalProps = asChild && React.isValidElement(children)
    ? mergeProps(defaultProps, props)
    : mergeProps(defaultProps, { ...props, children });

  return useRender({ props: finalProps, render: renderElement });
}

export function BadgeDot({ className, ...props }: BadgeDotProps) {
  return <span className={cn("size-1.5 rounded-full bg-current opacity-75", className)} data-slot="badge-dot" {...props} />;
}
