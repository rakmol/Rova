import { ContentFrame, Page, PageHeader } from '../../components/ui';
import { PublicEnforcementReports } from '../../reports/PublicEnforcementReports';
import { IncidentReports } from '../../incidents/IncidentReports';

export default function ReportsScreen(){
  return <Page><ContentFrame>
    <PageHeader eyebrow="Community" title="Road reports" subtitle="Share hazards safely and help review local updates." />
    <IncidentReports />
    <PublicEnforcementReports />
  </ContentFrame></Page>;
}
