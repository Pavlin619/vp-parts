import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorState } from "./error-state";

describe("ErrorState", () => {
  it("renders the message and retry button", () => {
    render(<ErrorState message="Something went wrong" onRetry={() => {}} />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Опитай отново" })).toBeInTheDocument();
  });

  it("calls onRetry when the button is clicked", async () => {
    const onRetry = jest.fn();
    render(<ErrorState message="Error" onRetry={onRetry} />);
    await userEvent.click(screen.getByRole("button", { name: "Опитай отново" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("applies card layout by default", () => {
    const { container } = render(<ErrorState message="Error" onRetry={() => {}} />);
    expect(container.firstChild).toHaveClass("min-h-[40vh]");
  });

  it("applies inline layout when variant is inline", () => {
    const { container } = render(
      <ErrorState message="Error" onRetry={() => {}} variant="inline" />,
    );
    expect(container.firstChild).not.toHaveClass("min-h-[40vh]");
    expect(container.firstChild).toHaveClass("py-4");
  });

  it("forwards extra className", () => {
    const { container } = render(
      <ErrorState message="Error" onRetry={() => {}} className="my-custom" />,
    );
    expect(container.firstChild).toHaveClass("my-custom");
  });
});
