// Excerpt of OpenMU Version075/Items/Jewels.cs (MIT, (c) 2017 MUnique; see NOTICE). Test fixture only.
namespace MUnique.OpenMU.Persistence.Initialization.Version075.Items;

public class Jewels : InitializerBase
{
    public override void Initialize()
    {
        this.GameConfiguration.Items.Add(this.CreateJewelOfBless());
    }

    protected ItemDefinition CreateJewelOfBless()
    {
        var itemDefinition = this.Context.CreateNew<ItemDefinition>();
        itemDefinition.Name = LocalizedString.FromResource(() => ItemNames.JewelOfBless);
        itemDefinition.Number = 13;
        itemDefinition.Group = 14;
        return itemDefinition;
    }
}
