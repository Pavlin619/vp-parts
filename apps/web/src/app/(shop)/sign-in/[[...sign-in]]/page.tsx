import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="page-container flex justify-center py-12">
      <SignIn />
    </div>
  );
}
