import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="page-container flex justify-center py-12">
      <SignUp />
    </div>
  );
}
