import { SignUpPanel } from "@/components/auth";

interface SignUpPageProps {
  searchParams: Promise<{ redirect_url?: string | string[] }>;
}

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const { redirect_url: redirectUrl } = await searchParams;

  return (
    <div className="page-container flex justify-center py-12">
      <SignUpPanel redirectUrl={typeof redirectUrl === "string" ? redirectUrl : undefined} />
    </div>
  );
}
