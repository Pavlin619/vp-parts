import { render, screen } from "@testing-library/react";
import { LoadingSpinner } from "./loading-spinner";

describe("LoadingSpinner", () => {
  it("renders the spinner with an accessible label", () => {
    render(<LoadingSpinner />);
    expect(screen.getByRole("status", { name: "Зареждане..." })).toBeInTheDocument();
  });

  it("renders without a full-page wrapper by default", () => {
    const { container } = render(<LoadingSpinner />);
    expect(container.firstChild).toHaveAttribute("role", "status");
  });

  it("wraps with a full-page container when fullPage is true", () => {
    const { container } = render(<LoadingSpinner fullPage />);
    expect(container.firstChild).not.toHaveAttribute("role", "status");
    expect(container.firstChild).toHaveClass("min-h-[40vh]");
  });

  it("forwards extra className to the spinner element", () => {
    render(<LoadingSpinner className="w-12 h-12" />);
    expect(screen.getByRole("status")).toHaveClass("w-12", "h-12");
  });
});
