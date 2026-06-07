import {
  BookOpen,
  Box,
  Bug,
  Compass,
  DoorOpen,
  Eye,
  Music,
  PackagePlus,
  Play,
  RefreshCcw,
  Skull,
  Star,
  Users,
  Volume2,
  VolumeX,
  Wrench
} from "lucide-react";
import { useState, type CSSProperties } from "react";
import { createResources, VICTORY_POINTS_TO_WIN } from "../../domain/constants";
import type { Command, GameState } from "../../domain/types";
import { clearSavedGame } from "../../persistence/storage";
import { useAudioSettings } from "../audio/useAudio";
import type { UiTool } from "../gameUiTypes";

export function PersistencePanel({
  state,
  onClose,
  onClear,
  submit,
  setTool
}: {
  state: GameState;
  onClose: () => void;
  onClear: () => void;
  submit: (command: Command) => void;
  setTool: (tool: UiTool) => void;
}) {
  const current = state.players.find((player) => player.id === state.currentPlayerId)!;
  const debugEnabled = Boolean(state.debugMode);
  const fogEnabled = state.fogEnabled !== false;
  const { settings, updateSettings } = useAudioSettings();
  const isMuted = settings.muted || (settings.musicVolume === 0 && settings.sfxVolume === 0);

  const restartGame = () => {
    setTool("none");
    submit({
      type: "createGame",
      players: state.players.map((player) => ({
        name: player.name,
        color: player.color,
        factionId: player.factionId
      })),
      seed: `wasteland-${Date.now()}`,
      fogEnabled,
      debugMode: debugEnabled
    });
    onClose();
  };

  const exitToMain = () => {
    clearSavedGame();
    setTool("none");
    onClear();
  };

  const toggleMute = () => {
    if (isMuted) {
      const hasCurrentVolume = settings.musicVolume > 0 || settings.sfxVolume > 0;
      updateSettings({
        musicVolume: hasCurrentVolume ? settings.musicVolume : settings.lastMusicVolume,
        sfxVolume: hasCurrentVolume ? settings.sfxVolume : settings.lastSfxVolume,
        muted: false
      });
      return;
    }
    updateSettings({ muted: true });
  };

  return (
    <section className="panel compact system-menu-content">
      <h2>
        <Compass size={18} />
        系统菜单
      </h2>

      <div className="system-menu-section system-menu-session-section">
        <SystemSectionHeading
          icon={Compass}
          title="本局操作"
          note="管理当前对局的关键操作"
        />
        <div className="system-menu-primary-actions">
          <SystemMenuAction
            icon={Play}
            title="继续游戏"
            description="返回当前对局"
            variant="continue"
            onClick={onClose}
          />
          <SystemMenuAction
            icon={RefreshCcw}
            title="重新开始本局"
            description="保留玩家与模式，重开本局"
            variant="restart"
            onClick={restartGame}
          />
          <SystemMenuAction
            icon={DoorOpen}
            title="退出到主菜单"
            description="结束对局并返回主页"
            variant="danger"
            onClick={exitToMain}
          />
        </div>
      </div>

      <div className="system-menu-section system-menu-audio-section">
        <SystemSectionHeading icon={Volume2} title="声音设置" note="调整游戏音量大小" />
        <div className="system-menu-audio-console">
          <SystemVolumeRow
            icon={Music}
            label="游戏背景音乐音量"
            value={settings.musicVolume}
            onChange={(value) => updateSettings({ musicVolume: value, muted: false })}
          />
          <SystemVolumeRow
            icon={Volume2}
            label="游戏音效音量"
            value={settings.sfxVolume}
            onChange={(value) => updateSettings({ sfxVolume: value, muted: false })}
          />
          <button
            type="button"
            className={isMuted ? "system-menu-mute-button muted" : "system-menu-mute-button"}
            aria-pressed={isMuted}
            onClick={toggleMute}
          >
            {isMuted ? <Volume2 size={26} /> : <VolumeX size={26} />}
            <span>
              <strong>{isMuted ? "一键恢复音量" : "一键静音"}</strong>
              <small>{isMuted ? "恢复静音前音量" : "关闭所有声音"}</small>
            </span>
          </button>
        </div>
      </div>

      <SystemMenuInfoSection state={state} modeLabel="本地热座" />

      <div className={debugEnabled ? "system-menu-section system-menu-debug-section enabled" : "system-menu-section system-menu-debug-section"}>
        <SystemSectionHeading
          icon={Wrench}
          title="调试工具"
          badge={debugEnabled ? "调试模式已开启" : "调试模式未开启"}
          note="仅在调试模式下生效"
        />
        <div className="debug-row system-menu-debug-actions">
          <SystemMenuAction
            icon={PackagePlus}
            title="补给当前玩家"
            description="获得资源补给"
            variant="debug"
            disabled={!debugEnabled}
            onClick={() =>
              submit({
                type: "debugSetResources",
                playerId: current.id,
                resources: createResources({ food: 8, wood: 8, metal: 8, fuel: 8, ammo: 8 })
              })
            }
          />
          <SystemMenuAction
            icon={Skull}
            title="推进尸潮进度"
            description="推进尸潮阶段"
            variant="debug"
            disabled={!debugEnabled}
            onClick={() => submit({ type: "debugAdvanceZombieTrack" })}
          />
          <SystemMenuAction
            icon={Eye}
            title="解锁全部迷雾"
            description="显示全地图"
            variant="debug"
            disabled={!debugEnabled}
            onClick={() => submit({ type: "debugRevealAllFog" })}
          />
        </div>
      </div>

      <p className="system-menu-shortcut-hint">
        <kbd>ESC</kbd>
        <span>可随时打开或关闭系统菜单</span>
      </p>

    </section>
  );
}

export function SystemMenuInfoSection({ state, modeLabel }: { state: GameState; modeLabel: string }) {
  const [showRules, setShowRules] = useState(false);
  const debugEnabled = Boolean(state.debugMode);
  const fogEnabled = state.fogEnabled !== false;

  return (
    <div className="system-menu-section system-menu-info-section">
      <SystemSectionHeading icon={BookOpen} title="规则与本局信息" note="" />
      <div className="system-menu-info-grid">
        <button type="button" className="system-menu-rules-button" onClick={() => setShowRules(true)}>
          <BookOpen size={40} />
          <span>
            <strong>查看规则说明</strong>
            <small>查看完整游戏规则</small>
          </span>
        </button>
        <div className="system-menu-match-info" aria-label="本局信息">
          <span className="system-menu-match-info-title">本局信息</span>
          <SystemInfoItem icon={Box} label="当前模式" value={modeLabel} />
          <SystemInfoItem icon={Users} label="玩家人数" value={`${state.players.length} 人`} />
          <SystemInfoItem icon={Eye} label="迷雾探索" value={fogEnabled ? "开启" : "关闭"} />
          <SystemInfoItem icon={Bug} label="调试模式" value={debugEnabled ? "开启" : "关闭"} />
          <SystemInfoItem icon={Star} label="胜利条件" value={`${VICTORY_POINTS_TO_WIN}分`} />
        </div>
      </div>
      {showRules ? <SystemRulesDialog onClose={() => setShowRules(false)} /> : null}
    </div>
  );
}

function SystemSectionHeading({
  icon: Icon,
  title,
  note,
  badge
}: {
  icon: typeof Compass;
  title: string;
  note: string;
  badge?: string;
}) {
  return (
    <div className="system-menu-section-heading">
      <span>
        <Icon size={22} />
        {title}
        {badge ? <b>{badge}</b> : null}
      </span>
      {note ? <small>{note}</small> : null}
    </div>
  );
}

function SystemMenuAction({
  icon: Icon,
  title,
  description,
  variant,
  disabled = false,
  onClick
}: {
  icon: typeof Play;
  title: string;
  description: string;
  variant: "continue" | "restart" | "danger" | "debug";
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={["system-menu-action-card", `system-menu-action-card-${variant}`].join(" ")}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon size={34} />
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
    </button>
  );
}

function SystemVolumeRow({
  icon: Icon,
  label,
  value,
  onChange
}: {
  icon: typeof Music;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="system-menu-volume-row">
      <Icon size={24} />
      <span>{label}</span>
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        value={value}
        aria-label={label}
        style={{ "--audio-volume-percent": `${value}%` } as CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <strong>{value}%</strong>
      <Volume2 size={20} />
    </label>
  );
}

function SystemInfoItem({ icon: Icon, label, value }: { icon: typeof Box; label: string; value: string }) {
  return (
    <div className="system-menu-info-item">
      <Icon size={28} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SystemRulesDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="system-rules-dialog-layer" role="presentation" onPointerDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="system-rules-dialog" role="dialog" aria-modal="true" aria-label="规则说明">
        <header>
          <BookOpen size={28} />
          <div>
            <h3>规则说明</h3>
            <p>废土拓荒生存手册</p>
          </div>
          <button type="button" className="icon-button modal-close-button" aria-label="关闭规则说明" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="system-rules-dialog-body">
          <article>
            <strong>目标</strong>
            <p>{`率先在自己的回合达到 ${VICTORY_POINTS_TO_WIN} 点胜利点即可获胜。`}</p>
          </article>
          <article>
            <strong>回合流程</strong>
            <p>掷骰产资源；如果掷出 7，则先处理尸潮来袭。完成掷骰与尸潮事项后，可以交易、建造、使用民兵或发展卡，最后结束回合并检查胜利。</p>
          </article>
          <article>
            <strong>资源产出</strong>
            <p>骰子点数等于地块数字时，相邻建筑获得资源。营地获得 1 张，堡垒获得 2 张。尸潮所在地块不产资源。</p>
          </article>
          <article>
            <strong>新资源区奖励</strong>
            <p>每名玩家首次在非起始的新资源区建立营地时，额外获得 1 点胜利点；同一玩家在每个新资源区最多获得一次该奖励。</p>
          </article>
          <article>
            <strong>尸潮来袭</strong>
            <ul>
              <li>掷出 7 时触发尸潮来袭；手牌超过上限的玩家先弃掉一半资源。</li>
              <li>当前玩家将尸潮标志移动到任意已翻开的地块，该地块被占领期间不能产出资源。</li>
              <li>如果尸潮所在地块相邻其他玩家的建筑，当前玩家可以选择其中一名玩家并随机抽取 1 张资源。</li>
              <li>每次尸潮来袭同时使尸潮围城进度 +1。</li>
            </ul>
          </article>
          <article>
            <strong>尸潮围城</strong>
            <ul>
              <li>掷出 7、探索翻出感染区或使用“尸潮逼近”发展卡，都会使尸潮围城进度 +1；进度达到 6 时立即结算围城。</li>
              <li>围城强度等于全场堡垒总数；全场防御值等于所有已激活民兵的总数。</li>
              <li>防御值不低于围城强度则防守成功：单独贡献最高者获得卡坦保卫者，最高贡献并列者各获得 1 张发展卡。</li>
              <li>防御值低于围城强度则防守失败：拥有堡垒且已激活民兵最少的玩家，各将 1 座堡垒降级为营地。</li>
              <li>围城结算后，尸潮围城进度归零，所有民兵变为未激活状态。</li>
            </ul>
          </article>
          <article>
            <strong>民兵规则</strong>
            <ul>
              <li>征召民兵需要支付金属 ×1、弹药 ×1。民兵必须驻守在自己的营地或堡垒，每座建筑最多驻守 2 个民兵。</li>
              <li>未激活民兵不能提供防御值，也不能移动或驱逐尸潮。支付食物 ×1 可以激活 1 个民兵。</li>
              <li>本回合刚激活的民兵会立即计入尸潮围城防御值，因此当回合发生围城时可以参与结算。</li>
              <li>本回合刚激活的民兵不能立即移动或驱逐尸潮；必须等到自己的下一个回合，才能执行主动行动。</li>
              <li>移动民兵时，只能沿自己的路线移动到自己的营地或堡垒；目标建筑仍然最多驻守 2 个民兵。</li>
              <li>驱逐尸潮时，民兵所在建筑必须与当前尸潮地块相邻。移动或驱逐完成后，该民兵会重新变为未激活状态。</li>
            </ul>
          </article>
          <article>
            <strong>迷雾探索</strong>
            <p>只有装甲车队可以探索迷雾。翻出资源地块可获得资源，翻出感染区会推进尸潮并随机弃掉 1 张资源。</p>
          </article>
          <article>
            <strong>发展卡</strong>
            <p>每回合最多使用 1 张发展卡，本回合购买的发展卡不能立刻使用。秘密据点在达到胜利条件时公开计分。</p>
          </article>
        </div>
      </section>
    </div>
  );
}
