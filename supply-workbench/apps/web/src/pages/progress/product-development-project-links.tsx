import { Typography } from 'antd';
import { Link, useLocation } from 'react-router';
import type { ProductDevelopmentProject } from '@sw/contracts';
import { DevelopmentCoordinationTag, DevelopmentFollowUpValue } from './product-development-progress.js';
import { coordinationReasons, displayedProjectStages, projectStage, registeredFollowUpFacts, type DevelopmentCoordination } from './product-development-workflow.js';
import { storeLabels } from './store-query.js';

type ProjectLinkKind = 'list' | 'follow-up';

export function developmentProjectLinkId(id: string, kind: ProjectLinkKind = 'list'): string {
  return `development-project-${kind}:${id}`;
}

export function DevelopmentProjectLink({ id, title, to, kind = 'list' }: {
  readonly id: string;
  readonly title: string;
  readonly to: { readonly search: string };
  readonly kind?: ProjectLinkKind;
}) {
  const { state } = useLocation();
  const origin = typeof state === 'object' && state !== null ? state : {};
  return <Link id={developmentProjectLinkId(id, kind)} to={to} state={{ ...origin, developmentProjectOrigin: kind }} preventScrollReset
    className="development-project-link development-list-project-link" aria-label={`打开项目 ${title}`}>打开项目</Link>;
}

export function DevelopmentProjectFollowUps({ entries, projectPath }: {
  readonly entries: readonly { readonly project: ProductDevelopmentProject; readonly item: DevelopmentCoordination }[];
  readonly projectPath: (id: string) => { readonly search: string };
}) {
  if (entries.length === 0) return null;
  return <section className="development-project-followups" aria-label="项目级跟进">
    <Typography.Title level={3}>项目级跟进</Typography.Title>
    <ul className="development-projects-without-rows">
      {entries.map(({ project, item }) => <li key={project.id}>
        <div className="development-project-followup-info">
          <div className="development-list-title">
            <strong>{project.title}</strong><DevelopmentCoordinationTag item={item} />
          </div>
          <Typography.Text type="secondary">{storeLabels[project.store]} · 项目负责人 {project.productLeadName ?? '待核对'} · {displayedProjectStages[projectStage(project)]}</Typography.Text>
          <ProjectFollowUpSummary item={item} />
        </div>
        <DevelopmentProjectLink id={project.id} title={project.title} to={projectPath(project.id)} kind="follow-up" />
      </li>)}
    </ul>
  </section>;
}

function ProjectFollowUpSummary({ item }: { readonly item: DevelopmentCoordination }) {
  const facts = registeredFollowUpFacts(item.followUp);
  return <div className="development-project-followup-facts">
    {coordinationReasons(item).map((reason) => <span key={reason}>{reason}</span>)}
    {facts.map((fact) =>
      <span key={fact.key}>{fact.label} <DevelopmentFollowUpValue fact={fact} /></span>)}
  </div>;
}
