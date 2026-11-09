// Excerpt of OpenMU VersionSeasonSix/Items/Potions.cs (MIT, (c) 2017 MUnique; see NOTICE). Test fixture only.
namespace MUnique.OpenMU.Persistence.Initialization.VersionSeasonSix.Items;

public class Potions : InitializerBase
{
    private const byte SiegePotionNumber = 7;

    public override void Initialize()
    {
        this.GameConfiguration.Items.Add(this.CreateApple());
        this.GameConfiguration.Items.Add(this.CreateSiegePotion());
        this.GameConfiguration.Items.Add(this.CreateJackOLanternBlessings());
        this.CreateElitePotion(70, LocalizedString.FromResource(() => ItemNames.EliteHealingPotion));
    }

    private ItemDefinition? CreateElitePotion(short number, LocalizedString name)
    {
        const byte group = 14;
        var potion = this.Context.CreateNew<ItemDefinition>();
        potion.Name = name;
        potion.Number = number;
        potion.Group = group;
        return potion;
    }

    private ItemDefinition CreateApple()
    {
        var apple = this.Context.CreateNew<ItemDefinition>();
        apple.Name = LocalizedString.FromResource(() => ItemNames.Apple);
        apple.Number = 0;
        apple.Group = 14;
        apple.Value = 5; // "apple.Number = 99;" in a comment must not count
        return apple;
    }

    private ItemDefinition CreateSiegePotion()
    {
        var definition = this.Context.CreateNew<ItemDefinition>();
        definition.Name = "Siege Potion";
        definition.Number = SiegePotionNumber;
        definition.Group = (byte)14;
        return definition;
    }

    private ItemDefinition CreateJackOLanternBlessings()
    {
        var item = this.Context.CreateNew<ItemDefinition>();
        item.Name = LocalizedString.FromResource(() => ItemNames.JackOLanternBlessings);
        item.Number = 46;
        item.Group = 14;
        return item;
    }
}
