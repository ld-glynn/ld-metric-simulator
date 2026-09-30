'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Card, Input, Label, Select } from '@/components/ui';

type Action = { type: 'click' | 'visit'; target: string; percent: number };

const RUNNER = 'npx -y github:ld-glynn/ld-experiment-visitors';

export default function SiteTrafficPage() {
  const [name, setName] = useState('Checkout button test');
  const [url, setUrl] = useState('');
  const [actions, setActions] = useState<Action[]>([{ type: 'click', target: '', percent: 6 }]);
  const [visitorsPerHour, setVisitorsPerHour] = useState(120);
  const [hours, setHours] = useState(4);
  const [devices, setDevices] = useState<'mixed' | 'desktop' | 'mobile'>('mixed');
  const [authUser, setAuthUser] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [headerName, setHeaderName] = useState('');
  const [headerValue, setHeaderValue] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const urlOk = /^https?:\/\/\S+/i.test(url.trim());
  const actionsOk = actions.every(a => a.target.trim() && a.percent >= 0 && a.percent <= 100);

  const journey = useMemo(() => {
    const j: Record<string, unknown> = {
      version: 1,
      name: name.trim() || 'Unnamed journey',
      url: url.trim(),
      actions: actions
        .filter(a => a.target.trim())
        .map(a => (a.type === 'click' ? { type: 'click', selector: a.target.trim(), probability: a.percent / 100 } : { type: 'visit', url: a.target.trim(), probability: a.percent / 100 })),
      visitorsPerHour: Math.max(1, Math.round(visitorsPerHour)),
      durationMinutes: Math.max(0, Math.round(hours * 60)),
      concurrency: visitorsPerHour > 600 ? 4 : 2,
      devices,
    };
    if (authUser.trim()) j.basicAuth = { username: authUser.trim(), password: authPass };
    if (headerName.trim()) j.headers = { [headerName.trim()]: headerValue };
    return j;
  }, [name, url, actions, visitorsPerHour, hours, devices, authUser, authPass, headerName, headerValue]);

  const json = JSON.stringify(journey, null, 2);
  const b64 = typeof window === 'undefined' ? '' : window.btoa(unescape(encodeURIComponent(json)));
  const fileCmd = `${RUNNER} journey.json`;
  const checkCmd = `${RUNNER} journey.json --once --headed`;
  const oneLiner = `${RUNNER} b64:${b64}`;

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  };

  const download = () => {
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'journey.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const setAction = (i: number, patch: Partial<Action>) => setActions(prev => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="rounded-xl bg-gradient-to-r from-emerald-700 to-teal-800 p-6 text-white shadow">
        <h1 className="text-2xl font-bold">Send real visitors to your own site</h1>
        <p className="mt-1 text-sm text-white/85">
          Your staging site already has the experiment wired in. This creates a stream of realistic browser visitors that load it, look around, and convert, so your own SDK evaluates the flag and records the metrics exactly as production traffic would.
        </p>
        <p className="mt-2 text-xs text-white/75">
          Prefer to skip the site and send events straight to LaunchDarkly?{' '}
          <Link href="/" className="underline">
            Use the direct mode
          </Link>
          .
        </p>
      </header>

      <Card title="1. Your site" subtitle="The page visitors land on. Use staging, never production.">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Label>Landing page URL</Label>
            <Input placeholder="https://staging.example.com/" value={url} onChange={e => setUrl(e.target.value)} />
          </div>
          <div>
            <Label>Name (for your notes)</Label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>
        </div>
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-gray-700">Site behind a password or protection bypass?</summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <Label hint="HTTP basic auth, if your staging site prompts for one.">Basic auth</Label>
              <div className="flex gap-2">
                <Input placeholder="username" value={authUser} onChange={e => setAuthUser(e.target.value)} />
                <Input placeholder="password" type="password" value={authPass} onChange={e => setAuthPass(e.target.value)} />
              </div>
            </div>
            <div>
              <Label hint="Sent on every request. For example x-vercel-protection-bypass.">Extra header</Label>
              <div className="flex gap-2">
                <Input placeholder="header name" value={headerName} onChange={e => setHeaderName(e.target.value)} />
                <Input placeholder="value" value={headerValue} onChange={e => setHeaderValue(e.target.value)} />
              </div>
            </div>
          </div>
        </details>
      </Card>

      <Card title="2. How a visitor converts" subtitle="What some visitors do after landing. Your site's own code fires the metric event when they do it.">
        <div className="space-y-3">
          {actions.map((a, i) => (
            <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select value={a.type} onChange={e => setAction(i, { type: e.target.value as Action['type'] })} className="sm:w-44">
                <option value="click">Click an element</option>
                <option value="visit">Reach a page</option>
              </Select>
              <Input
                placeholder={a.type === 'click' ? 'CSS selector, e.g. #buy-now or button.checkout' : 'Path or URL, e.g. /thank-you'}
                value={a.target}
                onChange={e => setAction(i, { target: e.target.value })}
                className="flex-1"
              />
              <div className="flex items-center gap-1">
                <Input type="number" min={0} max={100} step={0.1} value={a.percent} onChange={e => setAction(i, { percent: Number(e.target.value) })} className="w-24" />
                <span className="text-sm text-gray-500">% of visitors</span>
              </div>
              {actions.length > 1 && (
                <Button variant="link" onClick={() => setActions(prev => prev.filter((_, idx) => idx !== i))}>
                  remove
                </Button>
              )}
            </div>
          ))}
          <Button variant="link" onClick={() => setActions(prev => [...prev, { type: 'visit', target: '', percent: 3 }])}>
            + add another action
          </Button>
          <p className="text-xs text-gray-500">
            Tip: right-click the button on your site → Inspect, and use its <code>id</code> (as <code>#the-id</code>) or a stable class. Use a low percentage, like 3 to 8, so the results look like a real site. Visitors who do nothing still count as exposures.
          </p>
        </div>
      </Card>

      <Card title="3. How much traffic" subtitle="Visitors arrive unevenly, like people do, on a mix of desktop and mobile.">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label hint="120 an hour gives a readable chart within the hour; a few hundred reaches significance in a day.">Visitors per hour</Label>
            <Input type="number" min={1} max={5000} value={visitorsPerHour} onChange={e => setVisitorsPerHour(Number(e.target.value))} />
          </div>
          <div>
            <Label hint="0 keeps going until you stop it.">Run for (hours)</Label>
            <Input type="number" min={0} max={168} step={0.5} value={hours} onChange={e => setHours(Number(e.target.value))} />
          </div>
          <div>
            <Label>Devices</Label>
            <Select value={devices} onChange={e => setDevices(e.target.value as typeof devices)}>
              <option value="mixed">Mixed (55% desktop, 45% mobile)</option>
              <option value="desktop">Desktop only</option>
              <option value="mobile">Mobile only</option>
            </Select>
          </div>
        </div>
      </Card>

      <Card title="4. Run it" subtitle="From any machine that can open your staging site and has Node.js installed (a developer laptop is ideal).">
        {!urlOk || !actionsOk ? (
          <Alert tone="info">Fill in the landing page URL and at least one conversion action above and the commands will appear here.</Alert>
        ) : (
          <div className="space-y-5 text-sm">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label>Step 1. Save the journey file next to where you will run the command</Label>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={download}>
                    Download journey.json
                  </Button>
                  <Button variant="secondary" onClick={() => copy('json', json)}>
                    {copied === 'json' ? 'Copied' : 'Copy JSON'}
                  </Button>
                </div>
              </div>
              <pre className="max-h-64 overflow-auto rounded-md bg-gray-900 p-3 text-xs text-gray-100">{json}</pre>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label hint="Opens a visible browser, sends one visitor, tries every action, and tells you what it saw.">Step 2. Check it works</Label>
                <Button variant="secondary" onClick={() => copy('check', checkCmd)}>
                  {copied === 'check' ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <pre className="overflow-auto rounded-md bg-gray-900 p-3 text-xs text-gray-100">{checkCmd}</pre>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label hint="Leave the terminal open. Ctrl-C stops it and prints a summary.">Step 3. Start the traffic</Label>
                <Button variant="secondary" onClick={() => copy('run', fileCmd)}>
                  {copied === 'run' ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <pre className="overflow-auto rounded-md bg-gray-900 p-3 text-xs text-gray-100">{fileCmd}</pre>
            </div>

            <details>
              <summary className="cursor-pointer text-gray-700">No file? One command with the journey built in</summary>
              <div className="mt-2 flex items-start gap-2">
                <pre className="flex-1 overflow-auto whitespace-pre-wrap break-all rounded-md bg-gray-900 p-3 text-xs text-gray-100">{oneLiner}</pre>
                <Button variant="secondary" onClick={() => copy('one', oneLiner)}>
                  {copied === 'one' ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </details>

            <Alert tone="info">
              <strong>What you will see.</strong> Each visitor arrives in a fresh browser profile, so your site treats them as a new person. Your SDK evaluates the flag, shows them their variation, and sends the events. In LaunchDarkly, the flag&apos;s evaluation chart and the experiment&apos;s Results fill in over the next minutes and hours. If your site uses the browser SDK, the Audience tab fills in too. The runner needs Google Chrome or Edge on the machine, or run{' '}
              <code>npx playwright-core install chromium</code> once.
            </Alert>

            <Alert tone="warn">
              Before you start: the flag must be on in that environment and the experiment must be running, or LaunchDarkly will not record results. If your experiment&apos;s flag is only available to server-side SDKs but your page uses the browser SDK, turn on &quot;SDKs using Client-side ID&quot; in the flag&apos;s settings.
            </Alert>
          </div>
        )}
      </Card>

      <footer className="text-center text-xs text-gray-500">
        Runner source:{' '}
        <a className="underline" href="https://github.com/ld-glynn/ld-experiment-visitors" target="_blank" rel="noreferrer">
          github.com/ld-glynn/ld-experiment-visitors
        </a>{' '}
        · MIT
      </footer>
    </main>
  );
}
