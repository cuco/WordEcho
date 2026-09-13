import type { RewardDefinition, RewardTheme } from "../lib/types";

const sticker = (id: string, name: string, theme: RewardTheme, cost: number): RewardDefinition =>
  ({ id, name, theme, cost, image: `${import.meta.env.BASE_URL}rewards/${id}.png`, hungerDays: cost / 100 });

export const rewards: RewardDefinition[] = [
  sticker("cookie-cat", "饼干小猫", "pets", 200),
  sticker("carrot-bunny", "抱萝卜兔", "pets", 200),
  sticker("scarf-shiba", "围巾柴犬", "pets", 300),
  sticker("bamboo-panda", "竹叶熊猫", "pets", 500),
  sticker("cloud-sprite", "云朵精灵", "fantasy", 200),
  sticker("rainbow-unicorn", "彩虹独角兽", "fantasy", 300),
  sticker("mushroom-dragon", "蘑菇小龙", "fantasy", 300),
  sticker("moon-dragon", "月亮飞龙", "fantasy", 500),
  sticker("little-rocket", "小火箭", "space", 200),
  sticker("planet-friend", "星球伙伴", "space", 300),
  sticker("astro-bear", "宇航小熊", "space", 500),
  sticker("cosmic-whale", "星际鲸鱼", "space", 500),
];
