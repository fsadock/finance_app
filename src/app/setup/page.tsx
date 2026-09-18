import { getSetupStatus } from "@/lib/infra/settings";
import { SetupWizard } from "@/components/setup/setup-wizard";

export default async function SetupPage() {
  const status = await getSetupStatus();
  return <SetupWizard status={status} />;
}
