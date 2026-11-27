import { PortalPage } from '@/components/PortalPage';

/** The only route: prerendered once to `out/index.html` by the static export. */
export default function HomePage() {
  return <PortalPage />;
}
