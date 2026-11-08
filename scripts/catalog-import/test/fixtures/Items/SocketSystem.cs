// Excerpt of OpenMU VersionSeasonSix/Items/SocketSystem.cs (MIT, (c) 2017 MUnique; see NOTICE). Test fixture only.
namespace MUnique.OpenMU.Persistence.Initialization.VersionSeasonSix.Items;

public class SocketSystem : InitializerBase
{
    public override void Initialize()
    {
        const int seedNumberStart = 60;
        for (byte number = seedNumberStart; number < seedNumberStart + types.Length; number++)
        {
            var type = types[number - 60];
            this.CreateSeed(number, type.SeedName, type.Options);
        }

        this.CreateSphere(70, LocalizedString.FromResource(() => ItemNames.SphereMono), 102);
        this.CreateSphere(71, LocalizedString.FromResource(() => ItemNames.NoSuchResourceKey), 122);
    }

    private void CreateSeed(byte number, LocalizedString name, ItemOptionDefinition options)
    {
        var itemDefinition = this.Context.CreateNew<ItemDefinition>();
        itemDefinition.Name = name;
        itemDefinition.Number = number;
        itemDefinition.Group = 12;
    }

    private void CreateSphere(byte number, LocalizedString name, byte? dropLevel)
    {
        var itemDefinition = this.Context.CreateNew<ItemDefinition>();
        itemDefinition.Name = name;
        itemDefinition.Number = number;
        itemDefinition.Group = 12;
    }
}
