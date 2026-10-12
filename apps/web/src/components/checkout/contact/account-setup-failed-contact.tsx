/**
 * Checkout's contact panel for a Clerk account we can never file as a customer.
 * Nothing here can fix that; the panel's sign-out leads to ordering as a guest.
 */
export function AccountSetupFailedContact() {
  return (
    <div className="rounded-[10px] border border-line bg-bg-sunken px-4 py-3.5">
      <p role="alert" className="text-[13px] font-semibold text-danger">
        Профилът ви не можа да бъде създаден
      </p>
      <p className="mt-0.5 text-[12.5px] text-ink-3">
        Свържете се с нас, за да довършим регистрацията ви, или излезте от профила, за да
        поръчате като гост.
      </p>
    </div>
  );
}
