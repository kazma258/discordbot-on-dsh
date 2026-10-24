import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  type PermissionsBitField
} from 'discord.js';

export const ACCESS_COMMAND_NAMES = ['deeplook', '大肥魚'] as const;

export type AccessMode = 'on' | 'off';

/**
 * `/deeplook` with no option means on; `/deeplook mode:off` means off.
 * Discord slash commands use options rather than trailing text.
 */
export function resolveAccessMode(value: string | null | undefined): AccessMode | null {
  if (value === undefined || value === null || value === '' || value === 'on') return 'on';
  if (value === 'off') return 'off';
  return null;
}

export function isAdministrator(
  permissions: Pick<PermissionsBitField, 'has'> | null | undefined
): boolean {
  return permissions?.has(PermissionFlagsBits.Administrator) ?? false;
}

export function buildAccessCommand(name: (typeof ACCESS_COMMAND_NAMES)[number]) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription('開啟或關閉此頻道的讀取；省略 mode 預設為 on')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) =>
      option
        .setName('mode')
        .setDescription('on 開啟，off 關閉；省略預設 on')
        .setRequired(false)
        .addChoices(
          { name: 'on（開啟）', value: 'on' },
          { name: 'off（關閉）', value: 'off' }
        )
    );
}
