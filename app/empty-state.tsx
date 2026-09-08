import type { ReactNode } from "react";

export type EmptyStateVariant = "data" | "filtered" | "error";
export type EmptyStateSize = "full" | "inline" | "compact";

export function EmptyState({
  variant = "data",
  size = "full",
  icon,
  title,
  description,
  action,
  className,
}: {
  variant?: EmptyStateVariant;
  size?: EmptyStateSize;
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`empty-state2 v-${variant} s-${size}${className ? ` ${className}` : ""}`}>
      {icon !== undefined && <span className="empty-state2-icon" aria-hidden="true">{icon}</span>}
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

export function LoadingState({ size = "full", label, className }: { size?: EmptyStateSize; label?: string; className?: string }) {
  return (
    <div className={`empty-state2 s-${size}${className ? ` ${className}` : ""}`}>
      <span className="spinner" />
      {label && <p>{label}</p>}
    </div>
  );
}
