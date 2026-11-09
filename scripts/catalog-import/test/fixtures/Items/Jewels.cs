// Excerpt of OpenMU VersionSeasonSix/Items/Jewels.cs (MIT, (c) 2017 MUnique; see NOTICE). Test fixture only.
namespace MUnique.OpenMU.Persistence.Initialization.VersionSeasonSix.Items;

public class Jewels : Version075.Items.Jewels
{
    public override void Initialize()
    {
        base.Initialize();
        this.GameConfiguration.Items.Add(this.CreateJewelOfGuardian());
    }

    private ItemDefinition CreateJewelOfGuardian()
    {
        var itemDefinition = this.Context.CreateNew<ItemDefinition>();
        itemDefinition.Name = LocalizedString.FromResource(() => ItemNames.JewelOfGuardian);
        itemDefinition.Number = 31;
        itemDefinition.Group = 14;
        return itemDefinition;
    }
}
