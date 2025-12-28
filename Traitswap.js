package me.Penguin17.traitswapSmp;

import org.bukkit.Bukkit;
import org.bukkit.attribute.Attribute;
import org.bukkit.attribute.AttributeInstance;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.PlayerDeathEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerRespawnEvent;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.potion.PotionEffect;
import org.bukkit.potion.PotionEffectType;

import java.util.*;

public final class TraitswapSmp extends JavaPlugin implements Listener {

    private final Map<UUID, Trait> playerTraits = new HashMap<>();
    private final Set<Trait> usedTraits = new HashSet<>();

    @Override
    public void onEnable() {
        saveDefaultConfig();
        Bukkit.getPluginManager().registerEvents(this, this);
        loadTraits();
        // reapply traits to online players (after reload)
        for (Player p : Bukkit.getOnlinePlayers()) {
            if (!playerTraits.containsKey(p.getUniqueId())) assignRandomTrait(p);
            else applyTrait(p, playerTraits.get(p.getUniqueId()), false);
        }
        getLogger().info("TraitSwap v1.4 enabled!");
    }

    @Override
    public void onDisable() {
        saveTraits();
        getLogger().info("TraitSwap v1.4 disabled — traits saved.");
    }

    // -------------------------
    // JOIN — APPLY TRAIT
    // -------------------------
    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        Player player = event.getPlayer();

        if (!playerTraits.containsKey(player.getUniqueId())) {
            assignRandomTrait(player);
        }

        applyTrait(player, playerTraits.get(player.getUniqueId()), true);
    }

    // -------------------------
    // RESPAWN — REAPPLY TRAIT WITHOUT HEALING
    // -------------------------
    @EventHandler
    public void onRespawn(PlayerRespawnEvent event) {
        Player player = event.getPlayer();
        Bukkit.getScheduler().runTaskLater(this, () -> {
            Trait trait = playerTraits.get(player.getUniqueId());
            if (trait != null) applyTrait(player, trait, false);
        }, 1L);
    }

    // -------------------------
    // DEATH — SWAP TRAITS
    // -------------------------
    @EventHandler
    public void onDeath(PlayerDeathEvent event) {
        Player victim = event.getEntity();

        // stop default death messages (prevents spam)
        event.setDeathMessage(null);

        if (victim.getKiller() == null) return;
        Player killer = victim.getKiller();

        Trait victimTrait = playerTraits.get(victim.getUniqueId());
        Trait killerTrait = playerTraits.get(killer.getUniqueId());

        if (victimTrait == null) {
            assignRandomTrait(victim);
            victimTrait = playerTraits.get(victim.getUniqueId());
        }
        if (killerTrait == null) {
            assignRandomTrait(killer);
            killerTrait = playerTraits.get(killer.getUniqueId());
        }

        // Swap traits
        playerTraits.put(victim.getUniqueId(), killerTrait);
        playerTraits.put(killer.getUniqueId(), victimTrait);

        applyTrait(victim, killerTrait, false);
        applyTrait(killer, victimTrait, false);

        saveTraits();

        // Only one message
        victim.sendMessage("§7You swapped traits with §c" + killer.getName() + "§7!");
        killer.sendMessage("§7You swapped traits with §c" + victim.getName() + "§7!");
    }

    // -------------------------
    // ASSIGN RANDOM TRAIT
    // -------------------------
    private void assignRandomTrait(Player player) {
        List<Trait> available = new ArrayList<>(Arrays.asList(Trait.values()));
        available.removeAll(usedTraits);

        if (available.isEmpty()) {
            usedTraits.clear();
            available.addAll(Arrays.asList(Trait.values()));
        }

        Trait trait = available.get(new Random().nextInt(available.size()));
        usedTraits.add(trait);

        playerTraits.put(player.getUniqueId(), trait);
        applyTrait(player, trait, true);

        saveTraits();
        player.sendMessage("§aYou’ve been assigned trait: §b" + trait.getDisplayName());
    }

    // -------------------------
    // APPLY TRAIT
    // -------------------------
    private void applyTrait(Player player, Trait trait, boolean restoreHealth) {

        // clear potion effects
        for (PotionEffect effect : player.getActivePotionEffects()) {
            player.removePotionEffect(effect.getType());
        }

        // reset attributes
        AttributeInstance speed = player.getAttribute(Attribute.GENERIC_MOVEMENT_SPEED);
        AttributeInstance damage = player.getAttribute(Attribute.GENERIC_ATTACK_DAMAGE);
        AttributeInstance health = player.getAttribute(Attribute.GENERIC_MAX_HEALTH);

        if (speed != null) speed.setBaseValue(0.1);
        if (damage != null) damage.setBaseValue(1);
        if (health != null) health.setBaseValue(20);

        // apply trait
        trait.apply(player);

        // only restore health if true
        if (restoreHealth) {
            player.setHealth(player.getMaxHealth());
        } else {
            // make sure current health doesn't exceed max
            if (player.getHealth() > player.getMaxHealth())
                player.setHealth(player.getMaxHealth());
        }
    }

    // -------------------------
    // SAVE / LOAD
    // -------------------------
    private void saveTraits() {
        FileConfiguration config = getConfig();

        for (Map.Entry<UUID, Trait> entry : playerTraits.entrySet()) {
            config.set("traits." + entry.getKey(), entry.getValue().name());
        }

        saveConfig();
    }

    private void loadTraits() {
        FileConfiguration config = getConfig();
        if (!config.contains("traits")) return;

        for (String key : config.getConfigurationSection("traits").getKeys(false)) {
            try {
                UUID uuid = UUID.fromString(key);
                String name = config.getString("traits." + key);
                Trait trait = Trait.valueOf(name);
                playerTraits.put(uuid, trait);
                usedTraits.add(trait);
            } catch (Exception ignored) {
            }
        }
    }

    // -------------------------
    // /trait COMMAND
    // -------------------------
    @Override
    public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
        if (!(sender instanceof Player)) return false;
        Player player = (Player) sender;

        if (cmd.getName().equalsIgnoreCase("trait")) {
            Trait trait = playerTraits.get(player.getUniqueId());
            if (trait != null)
                player.sendMessage("§aYour current trait: §b" + trait.getDisplayName());
            else
                player.sendMessage("§cYou do not currently have a trait.");
            return true;
        }

        return false;
    }

    // -------------------------
// TRAITS
// -------------------------
    public enum Trait {
        SPEED_PLUS("+15% Speed") {
            public void apply(Player p) {
                p.getAttribute(Attribute.GENERIC_MOVEMENT_SPEED).setBaseValue(0.115);
            }
        },
        SPEED_MINUS("-15% Speed") {
            public void apply(Player p) {
                p.getAttribute(Attribute.GENERIC_MOVEMENT_SPEED).setBaseValue(0.085);
            }
        },
        DAMAGE_PLUS("+10% Damage") {
            public void apply(Player p) {
                p.getAttribute(Attribute.GENERIC_ATTACK_DAMAGE).setBaseValue(1.1);
            }
        },
        DAMAGE_MINUS("-10% Damage") {
            public void apply(Player p) {
                p.getAttribute(Attribute.GENERIC_ATTACK_DAMAGE).setBaseValue(0.9);
            }
        },
        HEALTH_PLUS("+10% Max Health") {
            public void apply(Player p) {
                p.getAttribute(Attribute.GENERIC_MAX_HEALTH).setBaseValue(22);
            }
        },
        HEALTH_MINUS("-10% Max Health") {
            public void apply(Player p) {
                p.getAttribute(Attribute.GENERIC_MAX_HEALTH).setBaseValue(18);
            }
        },
        REGEN_PLUS("Regeneration") {
            public void apply(Player p) {
                // Show icon, no particles
                p.addPotionEffect(new PotionEffect(PotionEffectType.REGENERATION, Integer.MAX_VALUE, 0, false, false));
            }
        },
        REGEN_MINUS("Hunger") {
            public void apply(Player p) {
                p.addPotionEffect(new PotionEffect(PotionEffectType.HUNGER, Integer.MAX_VALUE, 0, false, false));
            }
        },
        MINING_PLUS("Faster Mining") {
            public void apply(Player p) {
                p.addPotionEffect(new PotionEffect(PotionEffectType.HASTE, Integer.MAX_VALUE, 0, false, false));
            }
        },
        MINING_MINUS("Slower Mining") {
            public void apply(Player p) {
                p.addPotionEffect(new PotionEffect(PotionEffectType.MINING_FATIGUE, Integer.MAX_VALUE, 0, false, false));
            }
        },
        JUMP_PLUS("Jump Boost") {
            public void apply(Player p) {
                p.addPotionEffect(new PotionEffect(PotionEffectType.JUMP_BOOST, Integer.MAX_VALUE, 0, false, false));
            }
        },
        NO_TRAIT("No Trait") {
            public void apply(Player p) {
                // does nothing
            }
        },
        VISION_PLUS("Night Vision") {
            public void apply(Player p) {
                p.addPotionEffect(new PotionEffect(PotionEffectType.NIGHT_VISION, Integer.MAX_VALUE, 0, false, false));
            }
        };

        private final String displayName;

        Trait(String name) {
            this.displayName = name;
        }

        public String getDisplayName() {
            return displayName;
        }

        public abstract void apply(Player p);
    }


}
