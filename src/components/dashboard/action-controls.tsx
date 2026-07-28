"use client";

import {
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";

type ButtonVariant = "danger" | "ghost" | "primary" | "secondary";

type SubmitButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "type"
> & {
  children: ReactNode;
  pendingLabel?: string;
  variant?: ButtonVariant;
};

function buttonClassName(
  variant: ButtonVariant,
  className: string | undefined,
) {
  return ["ui-button", `ui-button--${variant}`, className]
    .filter(Boolean)
    .join(" ");
}

export function SubmitButton({
  children,
  className,
  disabled,
  pendingLabel = "Working",
  variant = "primary",
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const unavailable = disabled || pending;

  return (
    <button
      aria-busy={pending || undefined}
      className={buttonClassName(variant, className)}
      data-pending={pending || undefined}
      disabled={unavailable}
      type="submit"
      {...props}
    >
      <span className="ui-button__label">{children}</span>
      {pending ? (
        <span aria-live="polite" className="ui-button__pending">
          <span aria-hidden="true" className="ui-spinner" />
          <span className="sr-only">{pendingLabel}</span>
        </span>
      ) : null}
    </button>
  );
}

type ConfirmSubmitButtonProps = SubmitButtonProps & {
  confirmLabel?: string;
  description: string;
  title?: string;
};

export function ConfirmSubmitButton({
  children,
  className,
  confirmLabel = "Confirm",
  description,
  disabled,
  name,
  pendingLabel = "Working",
  title = "Confirm action",
  value,
  variant = "danger",
  ...props
}: ConfirmSubmitButtonProps) {
  const { pending } = useFormStatus();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const dialogId = useId();
  const showDialogCommand = {
    command: "show-modal",
    commandfor: dialogId,
  };
  const closeDialogCommand = {
    command: "close",
    commandfor: dialogId,
  };
  const dialogDismissal = {
    closedby: "any",
  };

  function openDialog() {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }

    requestAnimationFrame(() => cancelRef.current?.focus());
  }

  function closeDialog() {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (typeof dialog.close === "function") {
      dialog.close();
    } else {
      dialog.removeAttribute("open");
      triggerRef.current?.focus();
    }
  }

  return (
    <>
      <button
        className={buttonClassName(variant, className)}
        disabled={disabled || pending}
        onClick={openDialog}
        ref={triggerRef}
        type="button"
        {...props}
        {...showDialogCommand}
      >
        <span className="ui-button__label">{children}</span>
        {pending ? (
          <span aria-live="polite" className="ui-button__pending">
            <span aria-hidden="true" className="ui-spinner" />
            <span className="sr-only">{pendingLabel}</span>
          </span>
        ) : null}
      </button>
      <dialog
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="ui-dialog"
        id={dialogId}
        {...dialogDismissal}
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        onClose={() => triggerRef.current?.focus()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            closeDialog();
          }
        }}
        ref={dialogRef}
      >
        <div className="ui-dialog__content">
          <div className="ui-dialog__icon" aria-hidden="true">
            !
          </div>
          <div>
            <h2 className="ui-dialog__title" id={titleId}>
              {title}
            </h2>
            <p className="ui-dialog__description" id={descriptionId}>
              {description}
            </p>
          </div>
        </div>
        <div className="ui-dialog__actions">
          <button
            autoFocus
            className="ui-button ui-button--secondary"
            onClick={closeDialog}
            ref={cancelRef}
            type="button"
            {...closeDialogCommand}
          >
            Cancel
          </button>
          <button
            className="ui-button ui-button--danger"
            name={name}
            onClick={closeDialog}
            type="submit"
            value={value}
            {...closeDialogCommand}
          >
            {confirmLabel}
          </button>
        </div>
      </dialog>
    </>
  );
}
