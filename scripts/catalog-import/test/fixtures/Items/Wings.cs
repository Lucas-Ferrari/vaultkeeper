// Excerpt of OpenMU VersionSeasonSix/Items/Wings.cs (MIT, (c) 2017 MUnique; see NOTICE). Test fixture only.
namespace MUnique.OpenMU.Persistence.Initialization.VersionSeasonSix.Items;

public class Wings : WingsInitializerBase
{
    public override void Initialize()
    {
        this.CreateWing(0, 3, 2, LocalizedString.FromResource(() => ItemNames.WingsOfElf), 100, 10, 200, 180, 0, 0, 1, 0, 0, 0, 0, this.BuildOptions((0, OptionType.HealthRecover)), 12, 12, this._damageIncreaseByLevelTable, null);
        var capeOfLord = this.CreateWing(30, 2, 3, LocalizedString.FromResource(() => ItemNames.CapeOfLord), 180, 15, 200, 180, 0, 0, 0, 0, 1, 0, 0, this.BuildOptions((0b00, OptionType.PhysDamage)), 20, 10, this._damageIncreaseByLevelTable, this.CreateCapeOptions());
        capeOfLord.Group = 13;
        capeOfLord.SetGuid(capeOfLord.Group, capeOfLord.Number);

        this.CreateFeather();
        this.CreateSmallWing(130, 2, 2, LocalizedString.FromResource(() => ItemNames.SmallCapeOfLord), 15);
    }

    private ItemDefinition? CreateSmallWing(byte number, byte width, byte height, LocalizedString name, int defense)
    {
        var wing = this.CreateWing(number, width, height, name, 1, defense);
        return wing;
    }

    private void CreateFeather()
    {
        var feather = this.Context.CreateNew<ItemDefinition>();
        feather.Name = LocalizedString.FromResource(() => ItemNames.Feather);
        feather.Number = 14;
        feather.Group = 13;
        feather.SetGuid(feather.Group, feather.Number);
        this.GameConfiguration.Items.Add(feather);
    }

    private ItemDefinition CreateWing(byte number, byte width, byte height, LocalizedString name, byte dropLevel, int defense)
    {
        var wing = this.Context.CreateNew<ItemDefinition>();
        wing.Group = 12;
        wing.Number = number;
        wing.Name = name;
        return wing;
    }
}
