import { useMemo } from "react";
import { Dice5, User } from "lucide-react";
import { describeAgent } from "../simulation/agentProfile";
import { STATE, STATE_COLORS, STATE_LABELS, type SimulationResult, type StateCode, type World } from "../simulation/types";

interface AgentInspectorProps {
  world: World;
  result: SimulationResult;
  day: number;
  agentId: number | null;
  areaProfileId: string;
  onSelectAgent: (id: number) => void;
}

const MAX_OPTIONS = 60;

export default function AgentInspector({ world, result, day, agentId, areaProfileId, onSelectAgent }: AgentInspectorProps) {
  const areaAgents = useMemo(
    () => world.agents.filter((agent) => agent.homeProfileId === areaProfileId),
    [world.agents, areaProfileId],
  );

  const options = useMemo(() => {
    const step = Math.max(1, Math.floor(areaAgents.length / MAX_OPTIONS));
    return areaAgents.filter((_, index) => index % step === 0).slice(0, MAX_OPTIONS);
  }, [areaAgents]);

  const agent = agentId !== null ? world.agents[agentId] : undefined;

  const trajectory = useMemo(() => {
    if (!agent) return [];
    return result.frames.map((frame) => frame.states[agent.id] as StateCode);
  }, [agent, result.frames]);

  if (!agent) {
    return (
      <section className="agentInspector">
        <h3>
          <User size={15} /> Follow an agent
        </h3>
        <p className="inspectorEmpty">Select an area on the map, then pick an agent to trace.</p>
      </section>
    );
  }

  const home = world.profileById[agent.homeProfileId];
  const work = world.profileById[agent.workProfileId];
  const currentState = (trajectory[Math.min(day, trajectory.length - 1)] ?? STATE.susceptible) as StateCode;

  const exposedDay = trajectory.findIndex((state) => state !== STATE.susceptible);
  const infectiousDay = trajectory.findIndex((state) => state === STATE.infectious);
  const resolvedDay = trajectory.findIndex((state, index) => index > 0 && (state === STATE.recovered || state === STATE.deceased));
  const finalState = (trajectory[trajectory.length - 1] ?? STATE.susceptible) as StateCode;

  const pickRandom = () => {
    if (areaAgents.length === 0) return;
    const candidate = areaAgents[Math.floor(Math.random() * areaAgents.length)];
    onSelectAgent(candidate.id);
  };

  return (
    <section className="agentInspector">
      <h3>
        <User size={15} /> Follow an agent
      </h3>

      <div className="agentPickerRow">
        <select value={agent.id} onChange={(event) => onSelectAgent(Number(event.target.value))}>
          {options.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.codename}
            </option>
          ))}
        </select>
        <button className="iconButton" title="Random agent in this area" onClick={pickRandom}>
          <Dice5 size={16} />
        </button>
      </div>

      <div className="codenameCard">
        <span className="codename">{agent.codename}</span>
        <small>{describeAgent(agent)}</small>
      </div>

      <dl className="agentFacts">
        <div>
          <dt>Age</dt>
          <dd>{agent.age} yr</dd>
        </div>
        <div>
          <dt>Home</dt>
          <dd>{home.name}</dd>
        </div>
        <div>
          <dt>Works in</dt>
          <dd>
            {work.name === home.name ? "stays local" : work.name} · {agent.workSector}
          </dd>
        </div>
        <div>
          <dt>Sewer catchment</dt>
          <dd className="sewerLink">{home.rwziName}</dd>
        </div>
        <div>
          <dt>Now (day {day})</dt>
          <dd>
            <span className="stateDot" style={{ background: STATE_COLORS[currentState] }} />
            {STATE_LABELS[currentState]}
          </dd>
        </div>
        <div>
          <dt>Outcome</dt>
          <dd>
            {exposedDay < 0
              ? "never infected"
              : `infected d${exposedDay}` +
                (infectiousDay >= 0 ? `, infectious d${infectiousDay}` : "") +
                (resolvedDay >= 0 ? `, ${STATE_LABELS[finalState].toLowerCase()} d${resolvedDay}` : "")}
          </dd>
        </div>
      </dl>

      <div className="trajectoryStrip" title="Health state each day">
        {trajectory.map((state, index) => (
          <i
            key={index}
            className={index === Math.min(day, trajectory.length - 1) ? "today" : ""}
            style={{ background: STATE_COLORS[state] }}
          />
        ))}
      </div>
      <div className="trajectoryLegend">
        {[STATE.susceptible, STATE.exposed, STATE.infectious, STATE.recovered, STATE.deceased].map((state) => (
          <span key={state}>
            <i style={{ background: STATE_COLORS[state as StateCode] }} />
            {STATE_LABELS[state as StateCode]}
          </span>
        ))}
      </div>
    </section>
  );
}
