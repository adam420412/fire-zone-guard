// Backwards-compatible wrapper around ReportFaultButton
import ReportFaultButton from "./ReportFaultButton";

export default function ReportDeviceFaultButton(props: React.ComponentProps<typeof ReportFaultButton>) {
  return <ReportFaultButton {...props} />;
}
