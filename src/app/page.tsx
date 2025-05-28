'use client';

import { useState } from 'react';

export default function HomePage() {
  const [sdkKey, setSdkKey] = useState('');
  const [flagKey, setFlagKey] = useState('');
  const [events, setEvents] = useState([{ name: '', probability: 1.0 }]);
  const [userCount, setUserCount] = useState(10);
  const [contexts, setContexts] = useState([{ kind: 'user', attributes: [{ key: 'country', value: 'US' }] }]);
  const [status, setStatus] = useState<string | null>(null);

  const handleRun = async () => {
    setStatus('Running...');
    try {
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdkKey, flagKey, events, userCount, contexts })
      });

      const data = await res.json();
      setStatus(data.message || 'Simulation complete');
    } catch (err) {
      console.error(err);
      setStatus('Simulation failed');
    }
  };

  const updateEvent = (index: number, key: string, value: string | number) => {
    const newEvents = [...events];
    (newEvents[index] as any)[key] = key === 'probability' ? parseFloat(value as string) : value;
    setEvents(newEvents);
  };

  const updateContextAttr = (ctxIndex: number, attrIndex: number, key: 'key' | 'value', value: string) => {
    const newContexts = [...contexts];
    newContexts[ctxIndex].attributes[attrIndex][key] = value;
    setContexts(newContexts);
  };

  const addContext = () => {
    setContexts([...contexts, { kind: '', attributes: [{ key: '', value: '' }] }]);
  };

  const addAttribute = (ctxIndex: number) => {
    const newContexts = [...contexts];
    newContexts[ctxIndex].attributes.push({ key: '', value: '' });
    setContexts(newContexts);
  };

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="rounded-xl p-6 bg-gradient-to-r from-blue-600 to-purple-700 text-white shadow">
        <h1 className="text-3xl font-bold">LaunchDarkly Experiment Simulator</h1>
        <p className="mt-2 text-sm text-white/80">Simulate flag evaluations and event tracking for your experimentation projects.</p>
      </div>

      <div className="space-y-4 bg-white shadow border border-gray-200 p-6 rounded-xl">
        <div>
          <label className="block font-semibold text-gray-700">SDK Key</label>
          <input type="password" value={sdkKey} onChange={e => setSdkKey(e.target.value)} className="w-full border border-gray-300 p-2 rounded" />
          <p className="text-xs text-gray-500 mt-1">Enter your LaunchDarkly server-side SDK key. This is required to connect to your LaunchDarkly project.</p>
        </div>

        <div>
          <label className="block font-semibold text-gray-700">Flag Key</label>
          <input type="text" value={flagKey} onChange={e => setFlagKey(e.target.value)} className="w-full border border-gray-300 p-2 rounded" />
          <p className="text-xs text-gray-500 mt-1">Specify the feature flag key you want to evaluate during the simulation.</p>
        </div>

        <div>
          <label className="block font-semibold text-gray-700">Events</label>
          {events.map((event, idx) => (
            <div key={idx} className="flex gap-2 mb-2">
              <input type="text" placeholder="Event name" value={event.name} onChange={e => updateEvent(idx, 'name', e.target.value)} className="flex-1 border border-gray-300 p-2 rounded" />
              <input
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={isNaN(event.probability) || event.probability === undefined || event.probability === null ? '' : event.probability}
                onChange={e => updateEvent(idx, 'probability', e.target.value)}
                className="w-24 border border-gray-300 p-2 rounded"
              />
            </div>
          ))}
          <button onClick={() => setEvents([...events, { name: '', probability: 1.0 }])} className="text-blue-600 underline text-sm">+ Add Event</button>
          <p className="text-xs text-gray-500 mt-1">Add one or more events to track. Each event has a name and a probability (0-1) for how often it should be sent per user.</p>
        </div>

        <div>
          <label className="block font-semibold text-gray-700">Contexts</label>
          {contexts.map((ctx, ctxIdx) => (
            <div key={ctxIdx} className="border border-gray-300 p-3 rounded mb-3">
              <input type="text" placeholder="Kind (e.g. user, org)" value={ctx.kind} onChange={e => {
                const updated = [...contexts];
                updated[ctxIdx].kind = e.target.value;
                setContexts(updated);
              }} className="w-full border border-gray-300 p-2 rounded mb-2" />
              {ctx.attributes.map((attr, attrIdx) => (
                <div key={attrIdx} className="flex gap-2 mb-2">
                  <input type="text" placeholder="Attribute key" value={attr.key} onChange={e => updateContextAttr(ctxIdx, attrIdx, 'key', e.target.value)} className="flex-1 border border-gray-300 p-2 rounded" />
                  <input type="text" placeholder="Attribute value" value={attr.value} onChange={e => updateContextAttr(ctxIdx, attrIdx, 'value', e.target.value)} className="flex-1 border border-gray-300 p-2 rounded" />
                </div>
              ))}
              <button onClick={() => addAttribute(ctxIdx)} className="text-blue-600 underline text-sm">+ Add Attribute</button>
            </div>
          ))}
          <button onClick={addContext} className="text-blue-600 underline text-sm">+ Add Context</button>
          <p className="text-xs text-gray-500 mt-1">Define one or more contexts (e.g., user, org) and their attributes. Each context kind will be simulated as a unique entity.</p>
        </div>

        <div>
          <label className="block font-semibold text-gray-700">User Count</label>
          <input
            type="number"
            value={userCount || ''}
            onChange={e => {
              const val = e.target.value;
              setUserCount(val === '' ? 0 : Number(val));
            }}
            className="w-full border border-gray-300 p-2 rounded"
          />
          <p className="text-xs text-gray-500 mt-1">Set how many simulated users (or entities) to run through the flag evaluation and event tracking.</p>
        </div>

        <button onClick={handleRun} className="bg-gradient-to-r from-blue-600 to-purple-700 text-white px-4 py-2 rounded font-semibold shadow">Run Simulation</button>

        {status && <p className="mt-4 font-medium text-gray-800">Status: {status}</p>}
      </div>
    </main>
  );
}