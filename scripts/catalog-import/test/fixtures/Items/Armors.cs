// Excerpt of OpenMU VersionSeasonSix/Items/Armors.cs (MIT, (c) 2017 MUnique; see NOTICE). Test fixture only.
namespace MUnique.OpenMU.Persistence.Initialization.VersionSeasonSix.Items;

public class Armors : ArmorInitializerBase
{
    public override void Initialize()
    {
        this.CreateShield(0, 1, 0, 2, 2, LocalizedString.FromResource(() => ItemNames.SmallShield), 3, 1, 3, 22, 0, 70, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0);
        this.CreateArmor(0, 2, 2, 2, LocalizedString.FromResource(() => ItemNames.BronzeHelm), 16, 9, 34, 0, 80, 20, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0);
        this.CreateArmor(6, 2, 2, 2, LocalizedString.FromResource(() => ItemNames.ScaleHelm), 26, 12, 40, 0, 110, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0);
        this.CreateArmor(0, 3, 2, 2, "Bronze Armor", 18, 14, 34, 0, 80, 20, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0);
        this.CreateArmor(0, 4, 2, 2, "Bronze Pants", 15, 10, 34, 0, 80, 20, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0);
        this.CreateGloves(0, LocalizedString.FromResource(() => ItemNames.BronzeGloves), 13, 4, 4, 34, 0, 80, 20, 0, 1, 0, 1, 1, 0);
        this.CreateBoots(0, LocalizedString.FromResource(() => ItemNames.BronzeBoots), 12, 4, 10, 34, 0, 80, 20, 0, 0, 0, 0, 1, 0, 1, 1, 0, 0);
        this.CreateBoots(1, 6, 2, 2, "Old Boots", 12, 4, 10, 34, 0, 80, 20, 0, 0);
    }
}
